import {
  ApiError,
  apiFailure,
  getTeamMemberIds,
  requireAnyPermission,
  requirePermission
} from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const profileSelect = "id,full_name,email,role,requested_role,approval_status,department,active,created_at";

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function mapProfileRow(profile) {
  const assignment = first(profile.user_roles);
  const role = first(assignment?.role);
  const rolePermissions = Array.isArray(role?.role_permissions) ? role.role_permissions : [];
  const permissions = rolePermissions.map(item => first(item.permission)?.key).filter(Boolean);
  return {
    id: profile.id,
    name: profile.full_name,
    email: profile.email,
    role: profile.role,
    requestedRole: profile.requested_role,
    department: profile.department,
    approvalStatus: profile.approval_status,
    active: profile.active,
    dynamicRole: role ? {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.is_system,
      isActive: role.is_active
    } : null,
    permissions,
    teams: (profile.team_members || []).map(item => first(item.team)).filter(Boolean),
    supervisedTeams: profile.supervised_teams || []
  };
}

async function rows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function hydrateProfiles(client, profiles) {
  const userIds = profiles.map(profile => profile.id);
  if (!userIds.length) return [];

  const [userRoles, memberships, teams] = await Promise.all([
    rows(client.from("user_roles").select("user_id,role_id").in("user_id", userIds)),
    rows(client.from("team_members").select("user_id,team_id").in("user_id", userIds)),
    rows(client.from("teams").select("id,name,supervisor_id"))
  ]);
  const roleIds = [...new Set(userRoles.map(assignment => assignment.role_id))];
  const roles = roleIds.length
    ? await rows(client.from("roles").select("id,name,description,is_system,is_active").in("id", roleIds))
    : [];
  const rolePermissions = roleIds.length
    ? await rows(client.from("role_permissions").select("role_id,permission_id").in("role_id", roleIds))
    : [];
  const permissionIds = [...new Set(rolePermissions.map(assignment => assignment.permission_id))];
  const permissions = permissionIds.length
    ? await rows(client.from("permissions").select("id,key").in("id", permissionIds))
    : [];

  const permissionById = new Map(permissions.map(permission => [permission.id, permission]));
  const roleById = new Map(roles.map(role => [role.id, {
    ...role,
    role_permissions: rolePermissions
      .filter(assignment => assignment.role_id === role.id)
      .map(assignment => ({ permission: permissionById.get(assignment.permission_id) }))
  }]));
  const teamById = new Map(teams.map(team => [team.id, { id: team.id, name: team.name }]));

  return profiles.map(profile => {
    const assignment = userRoles.find(item => item.user_id === profile.id);
    return {
      ...profile,
      user_roles: assignment ? [{ role: roleById.get(assignment.role_id) }] : [],
      team_members: memberships
        .filter(membership => membership.user_id === profile.id)
        .map(membership => ({ team: teamById.get(membership.team_id) })),
      supervised_teams: teams
        .filter(team => team.supervisor_id === profile.id)
        .map(team => ({ id: team.id, name: team.name }))
    };
  });
}

export async function GET(request) {
  try {
    const session = await requireAnyPermission(request, [
      "employees.view_all",
      "employees.manage",
      "teams.manage",
      "roles.manage",
      "tasks.assign",
      "attendance.view_team",
      "locations.view_team",
      "reports.review",
      "expenses.approve",
      "sos.view_team",
      "projects.manage"
    ]);
    const global = session.access.isOwner || session.access.permissions.some(permission => [
      "employees.view_all",
      "employees.manage",
      "teams.manage",
      "roles.manage",
      "projects.manage"
    ].includes(permission));
    let query = session.client.from("profiles").select(profileSelect).order("created_at", { ascending: false });
    if (!global) {
      const userIds = await getTeamMemberIds(session);
      query = query.in("id", userIds);
    }
    const { data, error } = await query;
    if (error) throw error;
    const hydrated = await hydrateProfiles(session.client, data);
    return Response.json({ data: hydrated.map(mapProfileRow) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request) {
  try {
    const session = await requirePermission(request, "employees.manage");
    const body = await request.json();
    if (!body.id || !["approved", "rejected"].includes(body.approvalStatus)) {
      throw new ApiError("A valid account and approval decision are required.");
    }
    if (body.id === session.profile.id && body.approvalStatus === "rejected") {
      throw new ApiError("You cannot reject your own account.", 409);
    }
    const { data: target, error: targetError } = await session.client.from("profiles").select("id,requested_role").eq("id", body.id).single();
    if (targetError || !target) throw new ApiError("The requested account was not found.", 404);

    const update = {
      approval_status: body.approvalStatus,
      active: body.approvalStatus === "approved",
      updated_at: new Date().toISOString()
    };
    if (body.approvalStatus === "approved") update.role = target.requested_role;
    const { error } = await session.client.from("profiles").update(update).eq("id", body.id);
    if (error) throw error;

    if (
      body.approvalStatus === "approved"
      && (session.access.isOwner || session.access.permissions.includes("roles.manage"))
    ) {
      const templateName = ["manager", "admin"].includes(target.requested_role) ? "Management" : "Standard Employee";
      const { data: template, error: templateError } = await session.client.from("roles").select("id").ilike("name", templateName).single();
      if (templateError) throw templateError;
      const { error: assignmentError } = await session.client.from("user_roles").upsert({
        user_id: body.id,
        role_id: template.id,
        assigned_by: session.profile.id,
        assigned_at: new Date().toISOString()
      });
      if (assignmentError) throw assignmentError;
    }

    const { data, error: readError } = await session.client.from("profiles").select(profileSelect).eq("id", body.id).single();
    if (readError) throw readError;
    const [hydrated] = await hydrateProfiles(session.client, [data]);
    return Response.json({
      data: mapProfileRow(hydrated),
      message: body.approvalStatus === "approved"
        ? `${data.full_name} can now sign in.`
        : `${data.full_name}'s account request was rejected.`
    });
  } catch (error) {
    return apiFailure(error);
  }
}
