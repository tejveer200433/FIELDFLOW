import { createClient } from "@supabase/supabase-js";
import { secureSessionStorage } from "./secureStorage";

export function createFieldFlowAuth(config) {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: secureSessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });
}

export async function verifyEmployeeAccess(supabase) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("Your FieldFlow session is not valid.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,full_name,email,active,approval_status")
    .eq("id", auth.user.id)
    .single();
  if (profileError || !profile) throw new Error("Your FieldFlow profile is not available.");
  if (!profile.active || profile.approval_status !== "approved") {
    throw new Error("This account is not active and approved.");
  }

  const { data: access, error: accessError } = await supabase.rpc("get_my_access_context");
  if (accessError) throw new Error("Your FieldFlow permissions could not be verified.");
  const allowed = Boolean(access?.isOwner || access?.permissions?.includes("activity.view_self"));
  if (!allowed) throw new Error("Your role does not include the My Activity permission.");
  return { user: auth.user, profile, access };
}
