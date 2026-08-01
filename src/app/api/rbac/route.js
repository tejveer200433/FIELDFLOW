import { ApiError, apiFailure, requireAnyPermission } from "@/lib/supabaseServer";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const roleSelect = "id,name,description,is_system,is_active,created_at,updated_at";
const teamSelect = "id,name,description,supervisor_id,created_at,updated_at";
const userSelect = "id,full_name,email,department,active,approval_status";

const first = value => Array.isArray(value) ? value[0] : value;

function mapRole(role) {
  return {
    id: role.id,
    name: role.name,
    description: role.description || "",
    isSystem: role.is_system,
    isActive: role.is_active,
    userCount: role.user_roles?.length || 0,
    permissionIds: (role.role_permissions || []).map(item => first(item.permission)?.id).filter(Boolean),
    permissionKeys: (role.role_permissions || []).map(item => first(item.permission)?.key).filter(Boolean),
    createdAt: role.created_at,
    updatedAt: role.updated_at
  };
}

function mapTeam(team) {
  const supervisor = first(team.supervisor);
  return {
    id: team.id,
    name: team.name,
    description: team.description || "",
    supervisorId: team.supervisor_id,
    supervisor: supervisor ? { id: supervisor.id, name: supervisor.full_name, email: supervisor.email } : null,
    members: (team.team_members || []).map(item => {
      const member = first(item.member);
      return member ? { id: member.id, name: member.full_name, email: member.email } : null;
    }).filter(Boolean),
    createdAt: team.created_at,
    updatedAt: team.updated_at
  };
}

function mapUser(user) {
  const assignment = first(user.user_roles);
  const role = first(assignment?.role);
  return {
    id: user.id,
    name: user.full_name,
    email: user.email,
    department: user.department,
    active: user.active,
    approvalStatus: user.approval_status,
    dynamicRole: role ? { id: role.id, name: role.name, isActive: role.is_active } : null,
    teams: (user.team_members || []).map(item => first(item.team)).filter(Boolean)
  };
}

function validName(value, label, max = 120) {
  const name = String(value || "").trim();
  if (name.length < 2 || name.length > max) throw new ApiError(`${label} must be between 2 and ${max} characters.`);
  return name;
}

async function validatePermissionIds(client, permissionIds) {
  const ids = [...new Set(Array.isArray(permissionIds) ? permissionIds.filter(Boolean) : [])];
  if (!ids.length) return [];
  const { data, error } = await client.from("permissions").select("id").in("id", ids);
  if (error) throw error;
  if (data.length !== ids.length) throw new ApiError("One or more selected permissions are invalid.");
  return ids;
}

export async function GET(request) {
  try {
    const { client, access } = await requireAnyPermission(request, ["roles.manage", "teams.manage"]);
    const datasets = [
      ["roles", client.from("roles").select(roleSelect).order("name")],
      ["permissions", client.from("permissions").select("id,key,name,description,group_name").order("group_name").order("name")],
      ["users", client.from("profiles").select(userSelect).order("full_name")],
      ["teams", client.from("teams").select(teamSelect).order("name")],
      ["role permissions", client.from("role_permissions").select("role_id,permission_id")],
      ["user roles", client.from("user_roles").select("user_id,role_id")],
      ["team members", client.from("team_members").select("team_id,user_id")]
    ];
    if (access.isOwner) {
      datasets.push(["audit log", client.from("rbac_audit_log").select("id,actor_id,action,target_type,target_id,metadata,created_at").order("created_at", { ascending: false }).limit(30)]);
    }

    const results = await Promise.all(datasets.map(([, query]) => query));
    const failedIndex = results.findIndex(result => result.error);
    if (failedIndex !== -1) {
      console.error(`[RBAC GET] Failed to load ${datasets[failedIndex][0]}.`, results[failedIndex].error);
      throw new ApiError(`Roles & permissions could not load the ${datasets[failedIndex][0]} data. Confirm that the complete dynamic RBAC migration ran successfully.`, 503);
    }

    const roles = results[0].data;
    const permissions = results[1].data;
    const users = results[2].data;
    const teams = results[3].data;
    const rolePermissions = results[4].data;
    const userRoles = results[5].data;
    const teamMembers = results[6].data;
    const permissionById = new Map(permissions.map(permission => [permission.id, permission]));
    const roleById = new Map(roles.map(role => [role.id, role]));
    const userById = new Map(users.map(user => [user.id, user]));
    const teamById = new Map(teams.map(team => [team.id, team]));

    const hydratedRoles = roles.map(role => ({
      ...role,
      role_permissions: rolePermissions
        .filter(assignment => assignment.role_id === role.id)
        .map(assignment => ({ permission: permissionById.get(assignment.permission_id) })),
      user_roles: userRoles.filter(assignment => assignment.role_id === role.id)
    }));
    const hydratedTeams = teams.map(team => ({
      ...team,
      supervisor: userById.get(team.supervisor_id) || null,
      team_members: teamMembers
        .filter(membership => membership.team_id === team.id)
        .map(membership => ({ member: userById.get(membership.user_id) }))
    }));
    const hydratedUsers = users.map(user => {
      const assignment = userRoles.find(item => item.user_id === user.id);
      return {
        ...user,
        user_roles: assignment ? [{ role: roleById.get(assignment.role_id) }] : [],
        team_members: teamMembers
          .filter(membership => membership.user_id === user.id)
          .map(membership => ({ team: teamById.get(membership.team_id) }))
      };
    });
    const auditRows = results[7]?.data || [];

    return Response.json({
      data: {
        roles: hydratedRoles.map(mapRole),
        permissions: permissions.map(item => ({ id: item.id, key: item.key, name: item.name, description: item.description || "", groupName: item.group_name })),
        users: hydratedUsers.map(mapUser),
        teams: hydratedTeams.map(mapTeam),
        auditLog: auditRows.map(item => ({ id: item.id, action: item.action, targetType: item.target_type, targetId: item.target_id, metadata: item.metadata, createdAt: item.created_at, actor: userById.get(item.actor_id)?.full_name || "System" }))
      }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request) {
  try {
    const session = await requireAnyPermission(request, ["roles.manage", "teams.manage"]);
    const { client, profile } = session;
    const body = await request.json();
    if (body.entity === "role") {
      if (!hasPermission(session.access, "roles.manage")) throw new ApiError("You do not have permission to manage roles.", 403);
      const permissionIds = await validatePermissionIds(client, body.permissionIds);
      const { data: role, error } = await client.from("roles").insert({
        name: validName(body.name, "Role name", 100),
        description: String(body.description || "").trim().slice(0, 1000) || null,
        is_system: false,
        is_active: true
      }).select("id").single();
      if (error?.code === "23505") throw new ApiError("A role with this name already exists.", 409);
      if (error) throw error;
      if (permissionIds.length) {
        const { error: permissionError } = await client.from("role_permissions").insert(permissionIds.map(permissionId => ({ role_id: role.id, permission_id: permissionId })));
        if (permissionError) throw permissionError;
      }
      return Response.json({ data: { id: role.id }, message: "Role created." }, { status: 201 });
    }
    if (body.entity === "team") {
      if (!hasPermission(session.access, "teams.manage") && !hasPermission(session.access, "roles.manage")) throw new ApiError("You do not have permission to manage teams.", 403);
      const { data, error } = await client.from("teams").insert({
        name: validName(body.name, "Team name"),
        description: String(body.description || "").trim().slice(0, 1000) || null,
        supervisor_id: body.supervisorId || null
      }).select("id").single();
      if (error?.code === "23505") throw new ApiError("A team with this name already exists.", 409);
      if (error) throw error;
      const memberIds = [...new Set(Array.isArray(body.memberIds) ? body.memberIds.filter(Boolean) : [])];
      if (memberIds.length) {
        const { error: memberError } = await client.from("team_members").insert(memberIds.map(userId => ({ team_id: data.id, user_id: userId, added_by: profile.id })));
        if (memberError) throw memberError;
      }
      return Response.json({ data: { id: data.id }, message: "Team created." }, { status: 201 });
    }
    throw new ApiError("A valid RBAC entity is required.");
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request) {
  try {
    const session = await requireAnyPermission(request, ["roles.manage", "teams.manage"]);
    const { client, profile } = session;
    const body = await request.json();

    if (body.entity === "role") {
      if (!hasPermission(session.access, "roles.manage")) throw new ApiError("You do not have permission to manage roles.", 403);
      if (!body.id) throw new ApiError("Select a role to update.");
      const { data: existing, error: existingError } = await client.from("roles").select("id,name,is_system").eq("id", body.id).single();
      if (existingError || !existing) throw new ApiError("Role not found.", 404);
      if (existing.is_system && existing.name.toLowerCase() === "owner") {
        throw new ApiError("The protected Owner role cannot be renamed, disabled, or have permissions removed.", 409);
      }
      const permissionIds = await validatePermissionIds(client, body.permissionIds);
      const { error } = await client.from("roles").update({
        name: validName(body.name, "Role name", 100),
        description: String(body.description || "").trim().slice(0, 1000) || null,
        is_active: body.isActive !== false
      }).eq("id", body.id);
      if (error?.code === "23505") throw new ApiError("A role with this name already exists.", 409);
      if (error) throw error;
      const { error: deleteError } = await client.from("role_permissions").delete().eq("role_id", body.id);
      if (deleteError) throw deleteError;
      if (permissionIds.length) {
        const { error: insertError } = await client.from("role_permissions").insert(permissionIds.map(permissionId => ({ role_id: body.id, permission_id: permissionId })));
        if (insertError) throw insertError;
      }
      return Response.json({ message: "Role and permissions updated." });
    }

    if (body.entity === "userRole") {
      if (!hasPermission(session.access, "roles.manage")) throw new ApiError("You do not have permission to assign roles.", 403);
      if (!body.userId || !body.roleId) throw new ApiError("User and role are required.");
      if (body.userId === profile.id) throw new ApiError("Your protected Owner access cannot be reassigned from this screen.", 409);
      const { data: role, error: roleError } = await client.from("roles").select("id,is_active").eq("id", body.roleId).single();
      if (roleError || !role) throw new ApiError("Role not found.", 404);
      if (!role.is_active) throw new ApiError("An inactive role cannot be assigned.");
      const { error } = await client.from("user_roles").upsert({
        user_id: body.userId,
        role_id: body.roleId,
        assigned_by: profile.id,
        assigned_at: new Date().toISOString()
      });
      if (error) throw error;
      return Response.json({ message: "User role updated." });
    }

    if (body.entity === "team") {
      if (!hasPermission(session.access, "teams.manage") && !hasPermission(session.access, "roles.manage")) throw new ApiError("You do not have permission to manage teams.", 403);
      if (!body.id) throw new ApiError("Select a team to update.");
      const { error } = await client.from("teams").update({
        name: validName(body.name, "Team name"),
        description: String(body.description || "").trim().slice(0, 1000) || null,
        supervisor_id: body.supervisorId || null
      }).eq("id", body.id);
      if (error?.code === "23505") throw new ApiError("A team with this name already exists.", 409);
      if (error) throw error;
      const memberIds = [...new Set(Array.isArray(body.memberIds) ? body.memberIds.filter(Boolean) : [])];
      const { error: deleteError } = await client.from("team_members").delete().eq("team_id", body.id);
      if (deleteError) throw deleteError;
      if (memberIds.length) {
        const { error: insertError } = await client.from("team_members").insert(memberIds.map(userId => ({ team_id: body.id, user_id: userId, added_by: profile.id })));
        if (insertError) throw insertError;
      }
      return Response.json({ message: "Team updated." });
    }

    if (body.entity === "userTeam") {
      if (!hasPermission(session.access, "teams.manage") && !hasPermission(session.access, "roles.manage")) throw new ApiError("You do not have permission to assign teams.", 403);
      if (!body.userId) throw new ApiError("Select a user.");
      const { error: deleteError } = await client.from("team_members").delete().eq("user_id", body.userId);
      if (deleteError) throw deleteError;
      if (body.teamId) {
        const { error: insertError } = await client.from("team_members").insert({ team_id: body.teamId, user_id: body.userId, added_by: profile.id });
        if (insertError) throw insertError;
      }
      return Response.json({ message: "User team updated." });
    }

    throw new ApiError("A valid RBAC update is required.");
  } catch (error) {
    return apiFailure(error);
  }
}

export async function DELETE(request) {
  try {
    const session = await requireAnyPermission(request, ["roles.manage"]);
    const { client } = session;
    if (!hasPermission(session.access, "roles.manage")) throw new ApiError("You do not have permission to manage roles.", 403);
    const body = await request.json();
    if (body.entity !== "role" || !body.id) throw new ApiError("Select a role to delete.");

    const { data: role, error: roleError } = await client
      .from("roles")
      .select("id,name,is_system")
      .eq("id", body.id)
      .maybeSingle();
    if (roleError) throw roleError;
    if (!role) throw new ApiError("Role not found.", 404);
    if (role.is_system) throw new ApiError("System roles cannot be deleted.", 409);

    const { count, error: countError } = await client
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role_id", role.id);
    if (countError) throw countError;
    if (count) {
      throw new ApiError(`This role is assigned to ${count} user${count === 1 ? "" : "s"}. Reassign them before deleting it.`, 409);
    }

    const { error } = await client.from("roles").delete().eq("id", role.id);
    if (error) throw error;
    return Response.json({ message: `Role "${role.name}" was permanently deleted.` });
  } catch (error) {
    return apiFailure(error);
  }
}
