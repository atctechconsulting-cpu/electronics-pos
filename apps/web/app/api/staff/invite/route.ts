import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { supabaseAdmin } from "@/lib/supabase/admin";

const inviteSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string().trim().min(2).max(120),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  roleId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
});

const organizationScopedRoles = new Set(["super_admin", "accountant"]);

const branchScopedRoles = new Set([
  "branch_manager",
  "cashier",
  "inventory_officer",
]);

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status }
  );
}

async function userHasOrganizationPermission(params: {
  userId: string;
  organizationId: string;
  permissionKey: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select(
      `
        id,
        roles!inner (
          id,
          role_permissions!inner (
            permissions!inner (
              key
            )
          )
        )
      `
    )
    .eq("user_id", params.userId)
    .eq("organization_id", params.organizationId)
    .is("branch_id", null)
    .eq("roles.role_permissions.permissions.key", params.permissionKey);

  if (error) {
    throw error;
  }

  return Boolean(data?.length);
}

async function findAuthUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  /*
   * Supabase Auth does not currently expose a direct admin
   * "get user by email" method, so search the Auth user pages.
   *
   * This avoids the previous hard-coded 1,000-user ceiling.
   */
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const existingUser = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail
    );

    if (existingUser) {
      return existingUser;
    }

    if (data.users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

async function ensureProfile(params: {
  userId: string;
  fullName: string;
  phone: string | null;
  jobTitle: string | null;
}) {
  const { data: existingProfile, error: profileLookupError } =
    await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", params.userId)
      .maybeSingle();

  if (profileLookupError) {
    throw profileLookupError;
  }

  if (!existingProfile) {
    const { error: profileInsertError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: params.userId,
        full_name: params.fullName,
        phone: params.phone,
        job_title: params.jobTitle,
        is_active: true,
      });

    if (profileInsertError) {
      throw profileInsertError;
    }

    return;
  }

  /*
   * Do not overwrite an existing user's personal profile merely because
   * another organisation invited them.
   *
   * Their existing AlphaPOS identity belongs to them.
   */
}

async function addOrganizationMembership(params: {
  userId: string;
  organizationId: string;
  makeDefault: boolean;
}) {
  const { error } = await supabaseAdmin.from("user_organizations").upsert(
    {
      user_id: params.userId,
      organization_id: params.organizationId,
      is_default: params.makeDefault,
    },
    {
      onConflict: "user_id,organization_id",
    }
  );

  if (error) {
    throw error;
  }
}

async function addBranchMembership(params: {
  userId: string;
  branchId: string;
  makeDefault: boolean;
}) {
  const { error } = await supabaseAdmin.from("user_branches").upsert(
    {
      user_id: params.userId,
      branch_id: params.branchId,
      is_default: params.makeDefault,
    },
    {
      onConflict: "user_id,branch_id",
    }
  );

  if (error) {
    throw error;
  }
}

async function assignRole(params: {
  userId: string;
  organizationId: string;
  roleId: string;
  branchId: string | null;
}) {
  let existingAssignmentQuery = supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", params.userId)
    .eq("organization_id", params.organizationId)
    .eq("role_id", params.roleId);

  if (params.branchId) {
    existingAssignmentQuery = existingAssignmentQuery.eq(
      "branch_id",
      params.branchId
    );
  } else {
    existingAssignmentQuery = existingAssignmentQuery.is("branch_id", null);
  }

  const { data: existingAssignment, error: existingAssignmentError } =
    await existingAssignmentQuery.maybeSingle();

  if (existingAssignmentError) {
    throw existingAssignmentError;
  }

  if (existingAssignment) {
    return false;
  }

  const { error: assignmentError } = await supabaseAdmin
    .from("user_roles")
    .insert({
      user_id: params.userId,
      role_id: params.roleId,
      organization_id: params.organizationId,
      branch_id: params.branchId,
    });

  if (assignmentError) {
    throw assignmentError;
  }

  return true;
}

export async function POST(request: NextRequest) {
  try {
    /*
     * STEP 1
     * Authenticate the administrator making the request.
     */
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return errorResponse("Authentication required.", 401);
    }

    const accessToken = authorization.slice("Bearer ".length).trim();

    if (!accessToken) {
      return errorResponse("Authentication required.", 401);
    }

    const {
      data: { user: requestingUser },
      error: userError,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !requestingUser) {
      return errorResponse("Your session is invalid or has expired.", 401);
    }

    /*
     * STEP 2
     * Validate request body.
     */
    const rawBody = await request.json();
    const parsed = inviteSchema.safeParse(rawBody);

    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues[0]?.message ?? "Invalid invitation details.",
        400
      );
    }

    const {
      organizationId,
      email,
      fullName,
      jobTitle,
      phone,
      roleId,
      branchId,
    } = parsed.data;

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone?.trim() || null;
    const normalizedJobTitle = jobTitle?.trim() || null;

    /*
     * STEP 3
     * Verify organisation-level administration permissions.
     */
    let canManageStaff = false;
    let canManageRoles = false;

    try {
      [canManageStaff, canManageRoles] = await Promise.all([
        userHasOrganizationPermission({
          userId: requestingUser.id,
          organizationId,
          permissionKey: "users.manage",
        }),
        userHasOrganizationPermission({
          userId: requestingUser.id,
          organizationId,
          permissionKey: "roles.manage",
        }),
      ]);
    } catch (permissionError) {
      console.error("Unable to verify staff permissions:", permissionError);

      return errorResponse(
        "Unable to verify staff administration permission.",
        500
      );
    }

    if (!canManageStaff) {
      return errorResponse("You do not have permission to invite staff.", 403);
    }

    if (!canManageRoles) {
      return errorResponse(
        "You do not have permission to assign staff roles.",
        403
      );
    }

    /*
     * STEP 4
     * Validate requested role.
     */
    const { data: role, error: roleError } = await supabaseAdmin
      .from("roles")
      .select("id, name")
      .eq("id", roleId)
      .single();

    if (roleError || !role) {
      return errorResponse("The selected role does not exist.", 400);
    }

    if (organizationScopedRoles.has(role.name)) {
      if (branchId) {
        return errorResponse(
          `${role.name} must be assigned at organisation level.`,
          400
        );
      }
    } else if (branchScopedRoles.has(role.name)) {
      if (!branchId) {
        return errorResponse(`${role.name} requires a branch assignment.`, 400);
      }
    } else {
      return errorResponse(
        "This role cannot currently be assigned through staff invitations.",
        400
      );
    }

    /*
     * STEP 5
     * Validate branch belongs to the organisation.
     */
    if (branchId) {
      const { data: branch, error: branchError } = await supabaseAdmin
        .from("branches")
        .select("id")
        .eq("id", branchId)
        .eq("organization_id", organizationId)
        .single();

      if (branchError || !branch) {
        return errorResponse(
          "The selected branch does not belong to this organisation.",
          400
        );
      }
    }

    /*
     * STEP 6
     * Find out whether this is:
     *
     * A) a brand-new AlphaPOS user, or
     * B) an existing AlphaPOS user joining another organisation.
     */
    let existingAuthUser;

    try {
      existingAuthUser = await findAuthUserByEmail(normalizedEmail);
    } catch (lookupError) {
      console.error(
        "Unable to check existing authentication users:",
        lookupError
      );

      return errorResponse("Unable to validate the staff email address.", 500);
    }

    /*
     * EXISTING ALPHAPOS USER
     */
    if (existingAuthUser) {
      const existingUserId = existingAuthUser.id;

      /*
       * Check whether they already belong to THIS organisation.
       */
      const {
        data: existingOrganizationMembership,
        error: membershipLookupError,
      } = await supabaseAdmin
        .from("user_organizations")
        .select("user_id, organization_id")
        .eq("user_id", existingUserId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (membershipLookupError) {
        console.error(
          "Unable to check organisation membership:",
          membershipLookupError
        );

        return errorResponse(
          "Unable to validate the staff member's organisation access.",
          500
        );
      }

      if (existingOrganizationMembership) {
        return errorResponse(
          "This person already belongs to this organisation. Manage their roles and branch access from the Staff page.",
          409
        );
      }

      /*
       * Ensure legacy Auth accounts still have a profile row.
       * Existing profile information is deliberately NOT overwritten.
       */
      try {
        await ensureProfile({
          userId: existingUserId,
          fullName,
          phone: normalizedPhone,
          jobTitle: normalizedJobTitle,
        });

        /*
         * Because this person already uses AlphaPOS, preserve their current
         * default organisation. The new organisation is additional access.
         */
        await addOrganizationMembership({
          userId: existingUserId,
          organizationId,
          makeDefault: false,
        });

        if (branchId) {
          /*
           * Preserve their existing default branch when adding access to
           * another organisation.
           */
          await addBranchMembership({
            userId: existingUserId,
            branchId,
            makeDefault: false,
          });
        }

        await assignRole({
          userId: existingUserId,
          organizationId,
          roleId,
          branchId: branchId ?? null,
        });
      } catch (existingUserSetupError) {
        console.error(
          "Unable to add existing AlphaPOS user to organisation:",
          existingUserSetupError
        );

        /*
         * Roll back only the membership/access we just attempted to add.
         * Never delete the existing Auth account or their other organisation
         * memberships.
         */
        await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", existingUserId)
          .eq("organization_id", organizationId);

        if (branchId) {
          await supabaseAdmin
            .from("user_branches")
            .delete()
            .eq("user_id", existingUserId)
            .eq("branch_id", branchId);
        }

        await supabaseAdmin
          .from("user_organizations")
          .delete()
          .eq("user_id", existingUserId)
          .eq("organization_id", organizationId);

        return errorResponse(
          "The existing AlphaPOS account could not be added to this organisation.",
          500
        );
      }

      return NextResponse.json(
        {
          success: true,
          userId: existingUserId,
          email: normalizedEmail,
          existingUser: true,
          invitationSent: false,
          message:
            "Existing AlphaPOS user added successfully. They can use their current login credentials.",
        },
        {
          status: 200,
        }
      );
    }

    /*
     * NEW ALPHAPOS USER
     *
     * Supabase creates the Auth account and sends the invitation email.
     */
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      "http://localhost:3000";

    const { data: invitation, error: invitationError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
        data: {
          full_name: fullName,
          job_title: normalizedJobTitle,
          phone: normalizedPhone,
        },
        redirectTo: `${appUrl}/accept-invite`,
      });

    if (invitationError || !invitation.user) {
      console.error("Supabase invitation failed:", invitationError);

      return errorResponse(
        invitationError?.message ?? "Unable to invite staff member.",
        400
      );
    }

    const invitedUserId = invitation.user.id;

    /*
     * STEP 7
     * Complete AlphaPOS setup for the newly invited user.
     */
    try {
      const { error: registrationError } = await supabaseAdmin.rpc(
        "register_invited_staff",
        {
          target_user_id: invitedUserId,
          target_organization_id: organizationId,
          target_full_name: fullName,
          target_job_title: normalizedJobTitle,
          target_phone: normalizedPhone,
        }
      );

      if (registrationError) {
        throw registrationError;
      }

      if (branchId) {
        await addBranchMembership({
          userId: invitedUserId,
          branchId,
          makeDefault: true,
        });
      }

      await assignRole({
        userId: invitedUserId,
        organizationId,
        roleId,
        branchId: branchId ?? null,
      });
    } catch (setupError) {
      console.error(
        "Invitation created but AlphaPOS staff setup failed:",
        setupError
      );

      /*
       * New user only:
       * remove the newly-created Auth account if application setup failed.
       *
       * We NEVER do this for an existing AlphaPOS user.
       */
      const { error: cleanupError } =
        await supabaseAdmin.auth.admin.deleteUser(invitedUserId);

      if (cleanupError) {
        console.error(
          "Unable to clean up failed staff invitation:",
          cleanupError
        );
      }

      return errorResponse(
        "The invitation could not be completed. No staff access was created.",
        500
      );
    }

    return NextResponse.json(
      {
        success: true,
        userId: invitedUserId,
        email: normalizedEmail,
        existingUser: false,
        invitationSent: true,
        message: `Invitation sent to ${normalizedEmail}.`,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error("Unexpected staff invitation error:", error);

    return errorResponse(
      "An unexpected error occurred while inviting the staff member.",
      500
    );
  }
}
