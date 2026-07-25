"use client";

import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { supabase } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    setSending(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const redirectTo = `${window.location.origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(
        trimmedEmail,
        {
          redirectTo,
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      setSuccessMessage(
        "Check your email for a password reset link. You can close this page after the email arrives."
      );
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to send the password reset email."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-sm">
        <Link
          href="/login"
          className="inline-flex items-center text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to login
        </Link>

        <div className="mt-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
            <Mail className="h-6 w-6 text-slate-700" />
          </div>

          <h1 className="mt-5 text-2xl font-bold text-slate-900">
            Forgot your password?
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            Enter the email address linked to your AlphaPOS account. We’ll send
            you a secure link to create a new password.
          </p>
        </div>

        {successMessage ? (
          <div className="mt-6">
            <div className="flex gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />

              <div>
                <p className="font-medium">Reset email sent</p>
                <p className="mt-1">{successMessage}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setSuccessMessage("");
                setEmail("");
              }}
              className="mt-5 w-full rounded-lg border px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Send another reset email
            </button>

            <Link
              href="/login"
              className="mt-3 block w-full rounded-lg bg-slate-900 px-4 py-3 text-center text-sm font-medium text-white hover:bg-slate-800"
            >
              Return to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Email address
              </label>

              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-3 outline-none focus:border-slate-500"
                placeholder="you@example.com"
                required
              />
            </div>

            {errorMessage && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={sending}
              className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "Sending reset link..." : "Send reset link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
