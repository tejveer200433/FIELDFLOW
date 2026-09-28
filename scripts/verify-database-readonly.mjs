import { readFile, readdir, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

// GET requests only. Never logs credentials or employee records.
const root = new URL("../", import.meta.url);
const env = parseEnv(await readFile(new URL(".env.local", root), "utf8"));
const base = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!base || !key) throw new Error("The public Supabase connection is not configured.");
const checks = [];
async function probe(label, path) {
  try {
    const response = await fetch(new URL(path, base), {
      headers: { apikey: key }, signal: AbortSignal.timeout(15000)
    });
    const body = await response.json().catch(() => null);
    const result = { label, status: response.status, ok: response.ok };
    if (!response.ok) {
      result.code = body?.code || null;
      result.message = body?.message || body?.error || "Request failed";
    } else if (Array.isArray(body)) {
      result.returnedRowCount = body.length;
    }
    checks.push(result);
    return result;
  } catch (error) {
    const result = { label, ok: false, error: error.name };
    checks.push(result);
    return result;
  }
}
const migrationDirectory = new URL("supabase/migrations/", root);
const tables = new Set();
for (const name of (await readdir(migrationDirectory)).filter(name => name.endsWith(".sql"))) {
  const sql = await readFile(new URL(name, migrationDirectory), "utf8");
  for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_0-9]+)/gi)) {
    tables.add(match[1]);
  }
}
const schemaChecks = [...tables].sort().map(table => [
  `table:${table}`, `/rest/v1/${table}?select=*&limit=0`
]);
const columns = {
  employee_devices: ["agent_mode", "employee_sign_out_allowed", "employee_quit_allowed", "auto_start_tracking", "recovery_enabled", "managed_at", "managed_by"],
  attendance_shifts: ["check_in_captured_at", "check_out_captured_at", "check_in_client_event_id", "check_out_client_event_id", "worked_minutes", "risk_flags"],
  profiles: ["avatar_path"],
  tasks: ["archived_at", "recurrence", "estimated_minutes"]
};
for (const [table, names] of Object.entries(columns)) {
  for (const name of names) schemaChecks.push([
    `column:${table}.${name}`, `/rest/v1/${table}?select=${name}&limit=0`
  ]);
}
for (let index = 0; index < schemaChecks.length; index += 4) {
  await Promise.all(schemaChecks.slice(index, index + 4).map(args => probe(...args)));
}
// A zero result is not proof of RLS: the table might simply be empty.
// Only retain the number of visible IDs, never their values.
for (const table of ["profiles", "expenses", "daily_reports", "attendance_shifts", "employee_devices"]) {
  await probe(`anonymous-visibility:${table}`, `/rest/v1/${table}?select=id&limit=1`);
}
const report = {
  checkedAt: new Date().toISOString(), projectHost: new URL(base).hostname,
  access: "publishable key; anonymous role; GET only",
  limitations: "Does not inspect deployed RLS definitions, SQL function bodies, grants, migration history, or authenticated employee/manager behavior.",
  tableChecks: tables.size, checks
};
const output = new URL("docs/database-verification-results.json", root);
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  tableChecks: tables.size, totalChecks: checks.length,
  schemaErrors: checks.filter(check => ["42703", "PGRST204", "PGRST205"].includes(check.code)),
  anonymousAccessDenied: checks.filter(check => check.code === "42501").length,
  otherFailures: checks.filter(check => !check.ok && !["42501", "42703", "PGRST204", "PGRST205"].includes(check.code)),
  anonymousVisibility: checks.filter(check => check.label.startsWith("anonymous-visibility:")),
  report: fileURLToPath(output)
}, null, 2));
