"use client";

import { CheckCircle2, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/client";

type InviteContext = {
  accessToken: string;
  refreshToken: string;
  type: string | null;
};

function readInviteContext(): InviteContext | null {
  if (typeof window === "undefined") return null;

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  const error = hash.get("error");
  const errorCode = hash.get("error_code");

  if (error || errorCode) {
    return null;
  }

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  const type = hash.get("type");

  if (!accessToken || !refreshToken) {
    return null;
  }

  if (type && type !== "invite") {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    type,
  };
}

function readInviteError(): string | null {
  if (typeof window === "undefined") return null;

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  const error = hash.get("error");
  const errorCode = hash.get("error_code");
  const description = hash.get("error_description");

  if (!error && !errorCode) {
    return null;
  }

  if (errorCode === "otp_expired") {
    return "This invitation link has expired. Please ask your administrator to send a new invitation.";
  }

  if (description) {
    return decodeURIComponent(description.replace(/\+/g, " "));
  }

  return "This invitation link is invalid or has expired. Please ask your administrator to send a new invitation.";
}

export default function AcceptInvitePage() {
  const router = useRouter();

  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [invitedUserId, setInvitedUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initialiseInvite() {
      try {
        setCheckingSession(true);
        setSessionReady(false);
        setInvitedUserId(null);
        setEmail(null);
        setError(null);

        /*
         * Never trust an already-persisted browser session as proof that this
         * page was opened from a valid staff invitation.
         *
         * A browser may already be signed in as another AlphaPOS user.
         * The invitation URL itself must contain valid invite credentials.
         */

        const inviteError = readInviteError();

        if (inviteError) {
          if (!mounted) return;

          setError(inviteError);
          setCheckingSession(false);
          return;
        }

        const invite = readInviteContext();

        if (!invite) {
          if (!mounted) return;

          setError(
            "This invitation link is invalid or has expired. Please ask your administrator to send a new invitation."
          );
          setCheckingSession(false);
          return;
        }

        /*
         * Explicitly establish the session from THIS invitation's credentials.
         * This replaces any unrelated persisted session in the browser.
         */
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.setSession({
          access_token: invite.accessToken,
          refresh_token: invite.refreshToken,
        });

        if (!mounted) return;

        if (sessionError || !session?.user) {
          setError(
            "This invitation could not be verified. Please ask your administrator to send a new invitation."
          );
          setCheckingSession(false);
          return;
        }

        setInvitedUserId(session.user.id);
        setEmail(session.user.email ?? null);
        setSessionReady(true);

        /*
         * Remove invitation credentials from the visible URL after the
         * invitation identity has been successfully established.
         */
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );

        setCheckingSession(false);
      } catch {
        if (!mounted) return;

        setError(
          "This invitation could not be verified. Please ask your administrator to send a new invitation."
        );
        setCheckingSession(false);
      }
    }

    void initialiseInvite();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sessionReady || !invitedUserId) {
      setError(
        "Your invitation session is not available. Please reopen the invitation link."
      );
      return;
    }

    if (password.length < 8) {
      setError("Your password must contain at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      /*
       * Re-check the active session immediately before changing the password.
       * This prevents a stale or switched browser session from changing the
       * password of a different AlphaPOS account.
       */
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user || user.id !== invitedUserId) {
        throw new Error(
          "Your invitation session has changed or expired. Please reopen the invitation link."
        );
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      setCompleted(true);

      window.setTimeout(() => {
        router.replace("/dashboard");
        router.refresh();
      }, 1200);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to create your password."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white">
            <ShieldCheck className="h-6 w-6" />
          </div>

          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
            Welcome to AlphaPOS
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Complete your staff account to access your assigned workspace.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {checkingSession ? (
            <div className="flex min-h-48 flex-col items-center justify-center text-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />

              <p className="mt-4 text-sm font-medium text-slate-700">
                Verifying your invitation...
              </p>
            </div>
          ) : completed ? (
            <div className="flex min-h-48 flex-col items-center justify-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>

              <h2 className="mt-4 font-semibold text-slate-950">
                Account activated
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Your password has been created. Taking you to AlphaPOS...
              </p>
            </div>
          ) : !sessionReady ? (
            <div className="py-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                <KeyRound className="h-6 w-6 text-red-600" />
              </div>

              <h2 className="mt-4 font-semibold text-slate-950">
                Invitation unavailable
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                {error ??
                  "This invitation could not be verified. Please request a new invitation."}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Create your password
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  {email
                    ? `Set a password for ${email}.`
                    : "Set a password for your AlphaPOS account."}
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Password
                </label>

                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Confirm Password
                </label>

                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Enter your password again"
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Activating Account...
                  </>
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Activate Account
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
