"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [businessName, setBusinessName] = useState("");
  const [branchName, setBranchName] = useState("Main Branch");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();

  if (!user) return;

  setLoading(true);
  setErrorMessage("");

  const slug = slugify(businessName);

  const { error } = await supabase.rpc("create_initial_business", {
    business_name: businessName,
    business_slug: slug,
    branch_name: branchName,
  });

  if (error) {
    setLoading(false);
    setErrorMessage(error.message);
    return;
  }

  router.push("/dashboard");
  router.refresh();
}

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl items-center">
      <div className="w-full rounded-xl border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">
          Set up your business
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Create your first AlphaPOS organization and branch.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="text-sm font-medium text-slate-700">
              Business name
            </label>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="Bob's Electronics"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              First branch name
            </label>
            <input
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border px-3 py-2"
              placeholder="Main Branch"
            />
          </div>

          {errorMessage && (
            <p className="text-sm text-red-600">{errorMessage}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            {loading ? "Setting up..." : "Create business"}
          </button>
        </form>
      </div>
    </div>
  );
}