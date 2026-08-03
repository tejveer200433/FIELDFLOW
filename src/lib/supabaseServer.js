import { createClient } from "@supabase/supabase-js";
import { hasPermission } from "@/lib/permissions";

export class ApiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export async function requireSession(request, roles = []) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new ApiError("Supabase is not configured on this server.", 503);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new ApiError("Authentication required.", 401);
  const client = createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new ApiError("Invalid or expired session.", 401);
  const { data: profile, error: profileError } = await client.from("profiles").select("id,full_name,email,role,requested_role,approval_status,department,active").eq("id", auth.user.id).single();
  if (profileError || !profile) throw new ApiError("Your FieldFlow profile is not available.", 403);
  if (!profile.active || profile.approval_status !== "approved") throw new ApiError("This account is waiting for administrator approval.", 403);
  if (roles.length && !roles.includes(profile.role)) throw new ApiError("You do not have permission for this action.", 403);
  const { data: accessData, error: accessError } = await client.rpc("get_my_access_context");
  if (accessError || !accessData) {
    throw new ApiError("Your permissions could not be verified. Please try again.", 503);
  }
  const access = {
    isOwner: Boolean(accessData.isOwner),
    legacyRole: accessData.legacyRole || profile.role,
    role: accessData.role || null,
    permissions: Array.isArray(accessData.permissions) ? accessData.permissions : []
  };
  return { client, user: auth.user, profile: { ...profile, access }, access };
}

export async function requirePermission(request, permission) {
  const session = await requireSession(request);
  if (!hasPermission(session.access, permission)) {
    throw new ApiError("You do not have permission for this action.", 403);
  }
  return session;
}

export async function requireAnyPermission(request, permissions) {
  const session = await requireSession(request);
  if (!permissions.some(permission => hasPermission(session.access, permission))) {
    throw new ApiError("You do not have permission for this action.", 403);
  }
  return session;
}

export async function requireOwner(request) {
  const session = await requirePermission(request, "roles.manage");
  if (!session.access.isOwner) {
    throw new ApiError("Only the protected workspace Owner can perform this action.", 403);
  }
  return session;
}

export async function getTeamMemberIds({ client }) {
  const { data, error } = await client.rpc("get_my_team_member_ids");
  if (error) throw error;
  return (data || []).map(item => item.user_id);
}

export async function resolveUserScope(session, permissions) {
  if (permissions.all && hasPermission(session.access, permissions.all)) {
    return { type: "all", userIds: null };
  }
  if (permissions.team && hasPermission(session.access, permissions.team)) {
    return { type: "team", userIds: await getTeamMemberIds(session) };
  }
  if (permissions.self && hasPermission(session.access, permissions.self)) {
    return { type: "self", userIds: [session.profile.id] };
  }
  throw new ApiError("You do not have permission for this action.", 403);
}

export function assertUserInScope(scope, userId) {
  if (scope.type !== "all" && !scope.userIds.includes(userId)) {
    throw new ApiError("You can only access users within your permitted scope.", 403);
  }
}

export function apiFailure(error) {
  const status = error instanceof ApiError ? error.status : 500;
  if (status === 500) console.error(error);
  return Response.json({ error: status === 500 ? "An unexpected server error occurred." : error.message }, { status });
}

export function mapProfile(profile) {
  return {
    id: profile.id,
    name: profile.full_name,
    email: profile.email,
    role: profile.role,
    requestedRole: profile.requested_role,
    department: profile.department,
    approvalStatus: profile.approval_status,
    active: profile.active,
    isOwner: Boolean(profile.access?.isOwner),
    dynamicRole: profile.access?.role || null,
    permissions: profile.access?.permissions || []
  };
}
