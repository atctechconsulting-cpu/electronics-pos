"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  job_title: string | null;
};

type Organization = {
  id: string;
  name: string;
  slug: string;
};

type Branch = {
  id: string;
  name: string;
  code: string;
};

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  organization: Organization | null;
  branch: Branch | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadAuthContext() {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      setUser(null);
      setProfile(null);
      setOrganization(null);
      setBranch(null);
      setLoading(false);
      return;
    }

    setUser(userData.user);

    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, full_name, phone, avatar_url, job_title")
      .eq("id", userData.user.id)
      .single();

    setProfile(profileData);

    const { data: orgLink } = await supabase
      .from("user_organizations")
      .select("organizations:organization_id (id, name, slug)")
      .eq("user_id", userData.user.id)
      .order("is_default", { ascending: false })
      .limit(1)
      .single();

    const org = orgLink?.organizations as Organization | undefined;
    setOrganization(org ?? null);

    const { data: branchLink } = await supabase
      .from("user_branches")
      .select("branches:branch_id (id, name, code)")
      .eq("user_id", userData.user.id)
      .order("is_default", { ascending: false })
      .limit(1)
      .single();

    const currentBranch = branchLink?.branches as Branch | undefined;
    setBranch(currentBranch ?? null);

    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    async function initialiseAuth() {
      if (!mounted) return;
      await loadAuthContext();
    }

    void initialiseAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        void loadAuthContext();
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        organization,
        branch,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
