"use client";

import { CheckCircle2, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/client";

export default function AcceptInvitePage() {
  const router = useRouter();

  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
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
        setError(null);

        /*
         * Supabase's browser client detects an implicit-flow invitation URL:
         *
         * /accept-invite#access_token=...&refresh_token=...&type=invite
         *
         * and persists the authenticated session.
         *
         * Give the client an opportunity to process the URL, then retrieve
         * the resulting session.
         */
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (sessionError) {
          throw sessionError;
        }

        if (session?.user) {
          setEmail(session.user.email ?? null);
          setSessionReady(true);
          setCheckingSession(false);
          return;
        }

        /*
         * In some browsers the auth state may finish initialising just after
         * the first getSession() call. Listen briefly for the session event.
         */
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, nextSession) => {
          if (!mounted || !nextSession?.user) return;

          setEmail(nextSession.user.email ?? null);
          setSessionReady(true);
          setCheckingSession(false);
        });

        window.setTimeout(async () => {
          if (!mounted) return;

          const {
            data: { session: retrySession },
          } = await supabase.auth.getSession();

          if (!mounted) return;

          if (retrySession?.user) {
            setEmail(retrySession.user.email ?? null);
            setSessionReady(true);
          } else {
            setError(
              "This invitation link is invalid or has expired. Please ask your administrator to send a new invitation."
            );
          }

          setCheckingSession(false);
          subscription.unsubscribe();
        }, 1500);
      } catch (initialiseError) {
        if (!mounted) return;

        setError(
          initialiseError instanceof Error
            ? initialiseError.message
            : "Unable to verify this invitation."
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

    if (!sessionReady) {
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
       * The invitation link has already authenticated the invited user.
       * updateUser therefore sets the password on their own Auth account.
       */
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      setCompleted(true);

      /*
       * Remove the access/refresh tokens from the visible browser URL.
       */
      window.history.replaceState({}, document.title, window.location.pathname);

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
