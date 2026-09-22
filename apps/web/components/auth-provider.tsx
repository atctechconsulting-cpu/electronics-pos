"use client";

import { supabase } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  job_title: string | null;
  is_active: boolean;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
};

export type Branch = {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  is_head_office: boolean;
  is_default: boolean;
};

type EffectiveAccessResponse = {
  organization_id: string;
  branch_id: string | null;
  roles: string[];
  permissions: string[];
  is_super_admin: boolean;
};

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;

  organization: Organization | null;
  organizations: Organization[];

  branch: Branch | null;
  branches: Branch[];

  roles: string[];
  permissions: string[];
  isSuperAdmin: boolean;

  loading: boolean;
  switchingContext: boolean;
  accessLoading: boolean;
  hasOrganizationMemberships: boolean | null;
  contextError: string | null;

  hasRole: (roleName: string) => boolean;
  hasPermission: (permissionKey: string) => boolean;

  switchOrganization: (organizationId: string) => Promise<void>;
  switchBranch: (branchId: string) => Promise<void>;

  refreshAuthContext: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getStoredOrganizationId(userId: string) {
  if (typeof window === "undefined") return null;

  return window.localStorage.getItem(
    `alphapos:selected-organization:${userId}`
  );
}

function setStoredOrganizationId(userId: string, organizationId: string) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    `alphapos:selected-organization:${userId}`,
    organizationId
  );
}

function getStoredBranchId(userId: string, organizationId: string) {
  if (typeof window === "undefined") return null;

  return window.localStorage.getItem(
    `alphapos:selected-branch:${userId}:${organizationId}`
  );
}

function setStoredBranchId(
  userId: string,
  organizationId: string,
  branchId: string
) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    `alphapos:selected-branch:${userId}:${organizationId}`,
    branchId
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState<Branch | null>(null);

  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [switchingContext, setSwitchingContext] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [hasOrganizationMemberships, setHasOrganizationMemberships] = useState<boolean | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const contextRequest = useRef(0);

  const clearEffectiveAccess = useCallback(() => {
    setRoles([]);
    setPermissions([]);
    setIsSuperAdmin(false);
  }, []);

  const loadEffectiveAccess = useCallback(
    async (organizationId: string, branchId: string | null, requestId: number) => {
      setAccessLoading(true);

      try {
        const { data, error } = await supabase.rpc("get_effective_access", {
          target_organization_id: organizationId,
          target_branch_id: branchId,
        });

        if (requestId !== contextRequest.current) return;

        if (error) {
          throw new Error(error.message);
        }

        const access = data as EffectiveAccessResponse | null;

        setRoles(
          Array.isArray(access?.roles)
            ? access.roles.filter(
                (role): role is string => typeof role === "string"
              )
            : []
        );

        setPermissions(
          Array.isArray(access?.permissions)
            ? access.permissions.filter(
                (permission): permission is string =>
                  typeof permission === "string"
              )
            : []
        );

        setIsSuperAdmin(Boolean(access?.is_super_admin));
      } catch (error) {
        if (requestId !== contextRequest.current) return;
        clearEffectiveAccess();
        throw error;
      } finally {
        if (requestId === contextRequest.current) setAccessLoading(false);
      }
    },
    [clearEffectiveAccess]
  );

  const loadBranchesForOrganization = useCallback(
    async (
      userId: string,
      organizationId: string,
      requestId: number,
      preferredBranchId?: string | null
    ) => {
      const { data, error } = await supabase
        .from("user_branches")
        .select(
          `
          is_default,
          branches:branch_id (
            id,
            organization_id,
            name,
            code,
            is_head_office
          )
        `
        )
        .eq("user_id", userId);

      if (requestId !== contextRequest.current) return null;

      if (error) {
        throw new Error(error.message);
      }

      const availableBranches: Branch[] = (data ?? [])
        .map((link: any) => {
          const linkedBranch = link.branches;

          if (!linkedBranch) return null;

          return {
            id: linkedBranch.id,
            organization_id: linkedBranch.organization_id,
            name: linkedBranch.name,
            code: linkedBranch.code,
            is_head_office: Boolean(linkedBranch.is_head_office),
            is_default: Boolean(link.is_default),
          } satisfies Branch;
        })
        .filter(
          (candidate): candidate is Branch =>
            candidate !== null && candidate.organization_id === organizationId
        )
        .sort((a, b) => {
          if (a.is_default !== b.is_default) {
            return a.is_default ? -1 : 1;
          }

          if (a.is_head_office !== b.is_head_office) {
            return a.is_head_office ? -1 : 1;
          }

          return a.name.localeCompare(b.name);
        });

      setBranches(availableBranches);

      const storedBranchId = getStoredBranchId(userId, organizationId);

      const selectedBranch =
        availableBranches.find(
          (candidate) => candidate.id === preferredBranchId
        ) ??
        availableBranches.find(
          (candidate) => candidate.id === storedBranchId
        ) ??
        availableBranches.find((candidate) => candidate.is_default) ??
        availableBranches.find((candidate) => candidate.is_head_office) ??
        availableBranches[0] ??
        null;

      setBranch(selectedBranch);

      if (selectedBranch) {
        setStoredBranchId(userId, organizationId, selectedBranch.id);
      }

      return selectedBranch;
    },
    []
  );

  const loadAuthContext = useCallback(async () => {
    const requestId = ++contextRequest.current;
    setLoading(true);
    setSwitchingContext(false);
    setAccessLoading(false);
    setContextError(null);
    setHasOrganizationMemberships(null);
    setProfile(null);
    setOrganizations([]);
    setOrganization(null);
    setBranches([]);
    setBranch(null);
    clearEffectiveAccess();

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (requestId !== contextRequest.current) return;

      if (userError || !userData.user) {
        setUser(null);
        setProfile(null);
        setOrganizations([]);
        setOrganization(null);
        setBranches([]);
        setBranch(null);
        clearEffectiveAccess();
        return;
      }

      const currentUser = userData.user;
      setUser(currentUser);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, phone, avatar_url, job_title, is_active")
        .eq("id", currentUser.id)
        .single();

      if (requestId !== contextRequest.current) return;
      if (profileError) throw new Error("Unable to load your account status.");

      setProfile(profileData ?? null);

      if (!profileData?.is_active) return;

      const { data: organizationLinks, error: organizationError } =
        await supabase
          .from("user_organizations")
          .select(
            `
            is_default,
            is_active,
            organizations:organization_id (
              id,
              name,
              slug
            )
          `
          )
          .eq("user_id", currentUser.id)
          .order("is_default", { ascending: false });

      if (requestId !== contextRequest.current) return;

      if (organizationError) {
        throw new Error(organizationError.message);
      }

      setHasOrganizationMemberships((organizationLinks ?? []).length > 0);

      const availableOrganizations: Organization[] = (organizationLinks ?? [])
        .map((link: any) => {
          const linkedOrganization = link.organizations;

          if (!link.is_active || !linkedOrganization) return null;

          return {
            id: linkedOrganization.id,
            name: linkedOrganization.name,
            slug: linkedOrganization.slug,
            is_default: Boolean(link.is_default),
          } satisfies Organization;
        })
        .filter((candidate): candidate is Organization => candidate !== null);

      setOrganizations(availableOrganizations);

      const storedOrganizationId = getStoredOrganizationId(currentUser.id);

      const selectedOrganization =
        availableOrganizations.find(
          (candidate) => candidate.id === storedOrganizationId
        ) ??
        availableOrganizations.find((candidate) => candidate.is_default) ??
        availableOrganizations[0] ??
        null;

      setOrganization(selectedOrganization);

      if (!selectedOrganization) {
        setBranches([]);
        setBranch(null);
        clearEffectiveAccess();
        return;
      }

      setStoredOrganizationId(currentUser.id, selectedOrganization.id);

      const selectedBranch = await loadBranchesForOrganization(
        currentUser.id,
        selectedOrganization.id,
        requestId
      );

      if (requestId !== contextRequest.current) return;

      await loadEffectiveAccess(
        selectedOrganization.id,
        selectedBranch?.id ?? null,
        requestId
      );
    } catch (error) {
      if (requestId !== contextRequest.current) return;
      console.error("Unable to load authentication context:", error);
      setContextError("Unable to verify your workspace access. Please retry.");

      setOrganizations([]);
      setOrganization(null);
      setBranches([]);
      setBranch(null);
      clearEffectiveAccess();
    } finally {
      if (requestId === contextRequest.current) setLoading(false);
    }
  }, [clearEffectiveAccess, loadBranchesForOrganization, loadEffectiveAccess]);

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
        if (mounted) {
          void loadAuthContext();
        }
      }, 0);
    });

    return () => {
      mounted = false;
      contextRequest.current += 1;
      subscription.unsubscribe();
    };
  }, [loadAuthContext]);

  async function switchOrganization(organizationId: string) {
    if (!user || !profile?.is_active) return;

    const nextOrganization = organizations.find(
      (candidate) => candidate.id === organizationId
    );

    if (!nextOrganization) {
      throw new Error("You do not have access to the selected organization.");
    }

    if (organization?.id === nextOrganization.id) {
      return;
    }

    const requestId = ++contextRequest.current;
    setSwitchingContext(true);
    clearEffectiveAccess();

    try {
      setOrganization(nextOrganization);
      setStoredOrganizationId(user.id, nextOrganization.id);

      setBranches([]);
      setBranch(null);

      const selectedBranch = await loadBranchesForOrganization(
        user.id,
        nextOrganization.id,
        requestId
      );

      if (requestId !== contextRequest.current) return;

      await loadEffectiveAccess(
        nextOrganization.id,
        selectedBranch?.id ?? null,
        requestId
      );
    } catch (error) {
      if (requestId !== contextRequest.current) return;
      console.error("Unable to switch organization:", error);
      await loadAuthContext();
      throw error;
    } finally {
      if (requestId === contextRequest.current) setSwitchingContext(false);
    }
  }

  async function switchBranch(branchId: string) {
    if (!user || !profile?.is_active || !organization) return;

    const nextBranch = branches.find(
      (candidate) =>
        candidate.id === branchId &&
        candidate.organization_id === organization.id
    );

    if (!nextBranch) {
      throw new Error("You do not have access to the selected branch.");
    }

    if (branch?.id === nextBranch.id) {
      return;
    }

    const requestId = ++contextRequest.current;
    setSwitchingContext(true);
    clearEffectiveAccess();

    try {
      setBranch(nextBranch);
      setStoredBranchId(user.id, organization.id, nextBranch.id);

      await loadEffectiveAccess(organization.id, nextBranch.id, requestId);
    } catch (error) {
      if (requestId !== contextRequest.current) return;
      console.error("Unable to switch branch:", error);
      await loadAuthContext();
      throw error;
    } finally {
      if (requestId === contextRequest.current) setSwitchingContext(false);
    }
  }

  function hasRole(roleName: string) {
    return roles.includes(roleName);
  }

  function hasPermission(permissionKey: string) {
    return permissions.includes(permissionKey);
  }

  async function refreshAuthContext() {
    await loadAuthContext();
  }

  async function signOut() {
    contextRequest.current += 1;
    clearEffectiveAccess();
    setUser(null);
    setProfile(null);
    setOrganizations([]);
    setOrganization(null);
    setBranches([]);
    setBranch(null);
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,

        organization,
        organizations,

        branch,
        branches,

        roles,
        permissions,
        isSuperAdmin,

        loading,
        switchingContext,
        accessLoading,
        hasOrganizationMemberships,
        contextError,

        hasRole,
        hasPermission,

        switchOrganization,
        switchBranch,

        refreshAuthContext,
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
