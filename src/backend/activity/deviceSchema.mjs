const managementFields = new Set(["agent_mode", "employee_sign_out_allowed", "employee_quit_allowed", "auto_start_tracking", "recovery_enabled", "managed_at", "managed_by"]);

// Retry the same scoped query only for the known, additive management migration.
// Never select *, relax filters, or treat an authorization failure as a schema issue.
export async function readCompatibleDeviceQuery(buildQuery, fields) {
  const result = await buildQuery(fields);
  const missing = String(result.error?.message || "").match(/column (?:[a-z_][a-z0-9_]*\.)?"?([a-z_]+)"? does not exist/i);
  if (result.error?.code !== "42703" || !managementFields.has(missing?.[1])) return result;
  return buildQuery(fields.split(",").filter(field => !managementFields.has(field)).join(","));
}
