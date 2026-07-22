import { createClient } from "@supabase/supabase-js";

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
  return { client, user: auth.user, profile };
}

export function apiFailure(error) {
  const status = error instanceof ApiError ? error.status : 500;
  if (status === 500) console.error(error);
  return Response.json({ error: status === 500 ? "An unexpected server error occurred." : error.message }, { status });
}

export function mapProfile(profile) {
  return { id: profile.id, name: profile.full_name, email: profile.email, role: profile.role, requestedRole: profile.requested_role, department: profile.department, approvalStatus: profile.approval_status, active: profile.active };
}
