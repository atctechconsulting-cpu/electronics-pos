import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createStaffActorClient, supabaseAdmin } from "@/lib/supabase/admin";

const inviteSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(254),
  fullName: z.string().trim().min(2).max(120),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  roleId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
}).strict();

function errorResponse(message: string, status: number, code: string) {
  return NextResponse.json({ success: false, error: message, code }, { status });
}

// Only explicit application errors cross the API boundary. Never return raw
// Auth/PostgREST messages, SQL details, credentials or request tokens.
function rpcErrorResponse(error: { code?: string; message?: string }, invitationSent = false) {
  const known: Record<string, [number, string]> = {
    INVITE_UNAUTHENTICATED: [401, "Your session is invalid or has expired."],
    INVITE_FORBIDDEN: [403, "You no longer have permission to invite staff and assign roles in this organisation."],
    INVITE_INVALID_SCOPE: [400, "Select a valid role and its required organisation or branch scope."],
    INVITE_INVALID_TARGET: [400, "The staff account could not be verified. Refresh and try again."],
    INVITE_ALREADY_MEMBER: [409, "This person already belongs to this organisation. Manage their access from Staff."],
    INVITE_INACTIVE_MEMBER: [409, "This person has an inactive membership. Use the existing Staff activation control."],
    INVITE_INACTIVE_TARGET: [409, "This person's global AlphaPOS account is inactive. Organisation administrators cannot reactivate it."],
  };
  const code = error.message && Object.hasOwn(known, error.message) ? error.message :
    error.code === "42501" ? "INVITE_FORBIDDEN" :
    error.code === "PGRST301" || error.code === "PGRST303" ? "INVITE_UNAUTHENTICATED" :
    "INVITE_PROVISIONING_FAILED";
  const [status, message] = known[code] ?? [500,
    "Staff setup could not be confirmed. Refresh Staff before retrying."];
  return errorResponse(message + (invitationSent ? " An invitation email may already have been sent." : ""), status, code);
}

async function findAuthUserByEmail(email: string) {
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.trim().toLowerCase() === email);
    if (user) return user;
    if (data.users.length < perPage) return null;
  }
}

export async function POST(request: NextRequest) {
  let invitationSent = false;
  try {
    const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
    if (!match) return errorResponse("Authentication required.", 401, "INVITE_UNAUTHENTICATED");

    const actor = createStaffActorClient(match[1]);
    const { data: { user }, error: authError } = await actor.auth.getUser(match[1]);
    if (authError || !user) {
      return errorResponse("Your session is invalid or has expired.", 401, "INVITE_UNAUTHENTICATED");
    }

    const body = await request.json().catch(() => null);
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid invitation details. Check the supplied fields.", 400, "INVITE_INVALID_INPUT");
    }
    const { organizationId, roleId, branchId, email, fullName, phone, jobTitle } = parsed.data;
    const scope = {
      target_organization_id: organizationId,
      target_role_id: roleId,
      target_branch_id: branchId ?? null,
    };

    // Both RPCs use the caller JWT. The database derives auth.uid(); no actor ID
    // or cached permission result is supplied by this route or the browser.
    const { error: preflightError } = await actor.rpc("authorize_staff_invitation", scope);
    if (preflightError) return rpcErrorResponse(preflightError);

    // No privileged Auth lookup/invitation runs before database authorization.
    let target = await findAuthUserByEmail(email);
    const existingUser = Boolean(target);
    if (!target) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName, job_title: jobTitle || null, phone: phone || null },
        redirectTo: `${appUrl}/accept-invite`,
      });
      if (error || !data.user) {
        return errorResponse("Unable to send the invitation. Refresh Staff before retrying.", 502, "INVITE_AUTH_FAILED");
      }
      target = data.user;
      invitationSent = true;
    }

    const { error: finalizationError } = await actor.rpc("finalize_staff_invitation", {
      ...scope,
      target_user_id: target.id,
      target_email: email,
    });
    if (finalizationError) return rpcErrorResponse(finalizationError, invitationSent);

    return NextResponse.json({
      success: true,
      userId: target.id,
      email,
      existingUser,
      invitationSent,
      message: existingUser
        ? "Existing AlphaPOS user added successfully. They can use their current login credentials."
        : `Invitation sent to ${email}.`,
    }, { status: existingUser ? 200 : 201 });
  } catch {
    // Do not delete Auth users or compensate with service-role table deletes:
    // another request may have provisioned them, or a timed-out RPC may have
    // committed. Database mutations are atomic; Auth email delivery is not.
    return errorResponse(
      "Staff setup could not be confirmed. Refresh Staff before retrying." +
        (invitationSent ? " An invitation email may already have been sent." : ""),
      500,
      "INVITE_PROVISIONING_FAILED"
    );
  }
}
