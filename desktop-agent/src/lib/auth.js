import { createClient } from "@supabase/supabase-js";
import { secureSessionStorage } from "./secureStorage";

const fallbackLocks = new Map();

// Supabase's in-client single-flight protects one client instance. Web Locks
// also serialize auth operations across a recovery-launched WebView/process
// that shares the same Tauri origin and Credential Manager session.
export async function fieldFlowAuthLock(name, _acquireTimeout, callback) {
  if (globalThis.navigator?.locks?.request) {
    return globalThis.navigator.locks.request(`fieldflow:${name}`, { mode: "exclusive" }, callback);
  }
  const previous = fallbackLocks.get(name) || Promise.resolve();
  const current = previous.catch(() => {}).then(callback);
  fallbackLocks.set(name, current);
  try {
    return await current;
  } finally {
    if (fallbackLocks.get(name) === current) fallbackLocks.delete(name);
  }
}

export function createFieldFlowAuth(config) {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: secureSessionStorage,
      lock: fieldFlowAuthLock,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

export async function clearFieldFlowSession(supabase) {
  return secureSessionStorage.withExplicitRemoval(() => supabase.auth.signOut({ scope: "local" }));
}

export async function verifyEmployeeAccess(supabase, sessionManager) {
  const session = await sessionManager.getValidSession();
  const { data: auth, error: authError } = await supabase.auth.getUser(session.access_token);
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
