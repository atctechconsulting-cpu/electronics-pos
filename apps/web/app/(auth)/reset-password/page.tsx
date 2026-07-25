"use client";

import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [checkingSession, setCheckingSession] = useState(true);
  const [validSession, setValidSession] = useState(false);
  const [saving, setSaving] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function checkRecoverySession() {
      setCheckingSession(true);
      setErrorMessage("");

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (error) {
        setValidSession(false);
        setErrorMessage(error.message);
        setCheckingSession(false);
        return;
      }

      setValidSession(Boolean(session));
      setCheckingSession(false);
    }

    void checkRecoverySession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) {
        return;
      }

      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setValidSession(Boolean(session));
        setCheckingSession(false);
        setErrorMessage("");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (!validSession) {
      setErrorMessage(
        "This password reset link is invalid or has expired. Please request a new one."
      );
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Your new password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("The passwords do not match.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        throw new Error(error.message);
      }

      setSuccessMessage("Your password has been updated successfully.");

      setPassword("");
      setConfirmPassword("");
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update your password."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleContinue() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
          <KeyRound className="h-6 w-6 text-slate-700" />
        </div>

        <h1 className="mt-5 text-2xl font-bold text-slate-900">
          Create a new password
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          Choose a secure password for your AlphaPOS account.
        </p>

        {checkingSession ? (
          <div className="mt-6 rounded-xl border bg-slate-50 p-4 text-sm text-slate-500">
            Verifying your password reset link...
          </div>
        ) : successMessage ? (
          <div className="mt-6">
            <div className="flex gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />

              <div>
                <p className="font-medium">Password updated</p>
                <p className="mt-1">{successMessage}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleContinue}
              className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800"
            >
              Continue to login
            </button>
          </div>
        ) : validSession ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label className="text-sm font-medium text-slate-700">
                New password
              </label>

              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border px-3 py-3 pr-11 outline-none focus:border-slate-500"
                  placeholder="At least 8 characters"
                  required
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Confirm new password
              </label>

              <div className="relative mt-1">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-lg border px-3 py-3 pr-11 outline-none focus:border-slate-500"
                  placeholder="Enter the password again"
                  required
                />

                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label={
                    showConfirmPassword
                      ? "Hide password confirmation"
                      : "Show password confirmation"
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {errorMessage && (
              <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <p>{errorMessage}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Updating password..." : "Update password"}
            </button>
          </form>
        ) : (
          <div className="mt-6">
            <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />

              <div>
                <p className="font-medium">Reset link unavailable</p>
                <p className="mt-1">
                  {errorMessage ||
                    "This reset link is invalid or has expired. Request a new password reset email."}
                </p>
              </div>
            </div>

            <Link
              href="/forgot-password"
              className="mt-5 block w-full rounded-lg bg-slate-900 px-4 py-3 text-center text-sm font-medium text-white hover:bg-slate-800"
            >
              Request another reset link
            </Link>

            <Link
              href="/login"
              className="mt-3 block text-center text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Return to login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
