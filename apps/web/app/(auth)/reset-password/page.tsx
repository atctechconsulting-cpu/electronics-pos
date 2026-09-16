"use client";

import { supabase } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [checkingSession, setCheckingSession] = useState(true);
  const [recoverySessionAvailable, setRecoverySessionAvailable] =
    useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkRecoverySession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setRecoverySessionAvailable(Boolean(session));
      setCheckingSession(false);
    }

    void checkRecoverySession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "PASSWORD_RECOVERY" || session) {
        setRecoverySessionAvailable(Boolean(session));
        setCheckingSession(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleResetPassword(event: React.FormEvent) {
    event.preventDefault();

    setErrorMessage("");

    if (password.length < 8) {
      setErrorMessage("Your new password must contain at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("The passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        throw error;
      }

      setSuccess(true);

      await supabase.auth.signOut();

      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update your password."
      );
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <p className="text-sm text-slate-500">
            Verifying your password reset link...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        {success ? (
          <>
            <h1 className="text-2xl font-bold text-slate-900">
              Password updated
            </h1>

            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm leading-6 text-emerald-800">
                Your AlphaPOS password has been changed successfully. You can
                now sign in using your new password.
              </p>
            </div>

            <Link
              href="/login"
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Sign in
            </Link>
          </>
        ) : !recoverySessionAvailable ? (
          <>
            <h1 className="text-2xl font-bold text-slate-900">
              Reset link unavailable
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              This password reset link is invalid or has expired. Request a new
              password reset email to continue.
            </p>

            <Link
              href="/forgot-password"
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Request another reset link
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-900">
              Choose a new password
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Enter a new password for your AlphaPOS account.
            </p>

            <form onSubmit={handleResetPassword} className="mt-8 space-y-5">
              <div>
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-slate-700"
                >
                  New password
                </label>

                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={8}
                  disabled={loading}
                  className="mt-1 w-full rounded-lg border px-3 py-2.5 text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50"
                />

                <p className="mt-1.5 text-xs text-slate-500">
                  Use at least 8 characters.
                </p>
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="text-sm font-medium text-slate-700"
                >
                  Confirm new password
                </label>

                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={8}
                  disabled={loading}
                  className="mt-1 w-full rounded-lg border px-3 py-2.5 text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50"
                />
              </div>

              {errorMessage && (
                <div className="rounded-lg bg-red-50 px-3 py-2">
                  <p className="text-sm text-red-700">{errorMessage}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Updating password..." : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
