export const DEFAULT_AGENT_VERSION = "0.3.3";
export const AGENT_VERSION = import.meta.env?.VITE_AGENT_VERSION || DEFAULT_AGENT_VERSION;

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

export function readConfiguration(environment = import.meta.env) {
  const fieldFlowUrl = trimTrailingSlash(environment.VITE_FIELDFLOW_API_URL || "");
  const supabaseUrl = trimTrailingSlash(environment.VITE_SUPABASE_URL || "");
  const supabaseAnonKey = environment.VITE_SUPABASE_ANON_KEY || "";

  const missing = [];
  if (!fieldFlowUrl) missing.push("VITE_FIELDFLOW_API_URL");
  if (!supabaseUrl) missing.push("VITE_SUPABASE_URL");
  if (!supabaseAnonKey) missing.push("VITE_SUPABASE_ANON_KEY");

  return {
    fieldFlowUrl,
    supabaseUrl,
    supabaseAnonKey,
    agentVersion: environment.VITE_AGENT_VERSION || DEFAULT_AGENT_VERSION,
    debug: environment.VITE_DEBUG_LOGGING === "true",
    updatesEnabled: environment.VITE_AGENT_UPDATES_ENABLED === "true",
    valid: missing.length === 0,
    missing
  };
}
