import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createStaffActorClient, supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 60;

const inputSchema = z.object({ organizationId: z.string().uuid(), userId: z.string().uuid() }).strict();
const reservationSchema = z.object({ reservation_id: z.string().uuid() });
const recipientSchema = z.object({ email: z.string().email() });

function failure(code: string, status: number, error: string) {
  return NextResponse.json({ success: false, code, error }, { status });
}

function rpcFailure(error: { message?: string }) {
  const errors: Record<string, [number, string]> = {
    RESEND_UNAUTHENTICATED: [401, "Your session has expired. Please sign in again."],
    RESEND_FORBIDDEN: [403, "You do not have permission to resend invitations in this organisation."],
    RESEND_INVALID_TARGET: [404, "This staff member is unavailable in this organisation."],
    RESEND_INACTIVE: [409, "Resend unavailable: this account or organisation membership is inactive. Access has not been changed."],
    RESEND_NOT_PENDING: [409, "This invitation is no longer pending. Ask the person to log in or use password recovery."],
    RESEND_COOLDOWN: [429, "A resend was recently requested. Refresh Staff and wait until the displayed retry time."],
    RESEND_UNAVAILABLE: [409, "Resend unavailable. Refresh Staff before trying again."],
  };
  const code = error.message && Object.hasOwn(errors, error.message) ? error.message : "RESEND_UNAVAILABLE";
  const [status, message] = errors[code];
  return failure(code, status, message);
}

// A timeout cannot prove that the external Auth operation failed. Keep the
// persistent cooldown even if this process dies, or a late response arrives.
async function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 15000); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  let attempt: { p_org: string; p_user: string; p_reservation: string } | undefined;
  let dispatchStarted = false;
  async function finish(outcome: "sent" | "failed" | "unknown") {
    if (!attempt || !dispatchStarted) return;
    try {
      // Failure leaves the conservative 15-minute reservation in place.
      await withTimeout(Promise.resolve(supabaseAdmin.rpc("finish_staff_invitation_resend", {
        ...attempt, p_outcome: outcome,
      })));
    } catch { /* Never log Auth credentials or expose raw database errors. */ }
  }
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return rpcFailure({ message: "RESEND_UNAUTHENTICATED" });
    const actor = createStaffActorClient(token);
    const { data: { user }, error: authenticationError } = await actor.auth.getUser(token);
    if (authenticationError || !user) return rpcFailure({ message: "RESEND_UNAUTHENTICATED" });
    const input = inputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return failure("RESEND_INVALID_INPUT", 400, "Select a valid staff member and organisation.");

    // No caller-supplied recipient, redirect or access assignments. Fail closed
    // on missing/invalid deployment configuration rather than sending localhost links.
    const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!configuredUrl) return failure("RESEND_CONFIGURATION", 503, "Invitation delivery is not configured. Contact support.");
    const appUrl = new URL(configuredUrl);
    if (!["http:", "https:"].includes(appUrl.protocol) || appUrl.username || appUrl.password || appUrl.search || appUrl.hash) {
      return failure("RESEND_CONFIGURATION", 503, "Invitation delivery is not configured. Contact support.");
    }
    const redirectTo = `${configuredUrl.replace(/\/$/, "")}/accept-invite`;
    const scope = { p_org: input.data.organizationId, p_user: input.data.userId };
    const { data: reservation, error: reserveError } = await actor.rpc("reserve_staff_invitation_resend", scope);
    if (reserveError) return rpcFailure(reserveError);
    const parsedReservation = reservationSchema.safeParse(reservation);
    if (!parsedReservation.success) return rpcFailure({ message: "RESEND_UNAVAILABLE" });
    attempt = { ...scope, p_reservation: parsedReservation.data.reservation_id };

    // Authoritative Auth lookup only AFTER caller-JWT target authorization.
    const { data: identity, error: identityError } = await withTimeout(supabaseAdmin.auth.admin.getUserById(scope.p_user));
    if (identityError || !identity.user || identity.user.id !== scope.p_user) return rpcFailure({ message: "RESEND_INVALID_TARGET" });
    if (!identity.user.invited_at || identity.user.email_confirmed_at || identity.user.last_sign_in_at) {
      return rpcFailure({ message: "RESEND_NOT_PENDING" });
    }

    // Recheck current permissions, activation and invitation acceptance immediately
    // before consuming a single-use dispatch reservation. No provisioning RPC.
    const { data: recipient, error: dispatchError } = await actor.rpc("dispatch_staff_invitation_resend", attempt);
    if (dispatchError) return rpcFailure(dispatchError);
    dispatchStarted = true;
    const parsedRecipient = recipientSchema.safeParse(recipient);
    if (!parsedRecipient.success || parsedRecipient.data.email !== identity.user.email) {
      await finish("failed");
      return rpcFailure({ message: "RESEND_INVALID_TARGET" });
    }

    const { data, error } = await withTimeout(supabaseAdmin.auth.admin.inviteUserByEmail(parsedRecipient.data.email, { redirectTo }));
    if (error) {
      const accepted = error.code === "email_exists" || error.code === "user_already_exists";
      // 5xx/transport failures may have sent mail. Do not shorten their cooldown.
      const ambiguous = !error.status || error.status >= 500;
      await finish(ambiguous ? "unknown" : "failed");
      if (accepted) return rpcFailure({ message: "RESEND_NOT_PENDING" });
      return failure("RESEND_DELIVERY_FAILED", 502,
        "Invitation delivery could not be confirmed. An email may have been sent. Wait before retrying; access has not changed.");
    }
    if (!data?.user || data.user.id !== scope.p_user || data.user.email !== parsedRecipient.data.email) {
      await finish("unknown");
      return failure("RESEND_DELIVERY_UNKNOWN", 502, "Invitation delivery could not be confirmed. Wait before retrying; contact support if this continues.");
    }
    await finish("sent");
    return NextResponse.json({ success: true, message: "Invitation sent. Existing access and assignments are unchanged." }, { status: 200 });
  } catch {
    await finish("unknown");
    return failure("RESEND_DELIVERY_UNKNOWN", 503,
      "Resend could not be confirmed. An email may have been sent. Refresh Staff and wait before retrying.");
  }
}
