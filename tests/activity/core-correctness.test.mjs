import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = path => readFileSync(join(root, path), "utf8");

test("access-context failures do not fall back to legacy role permissions", () => {
  for (const path of ["src/lib/supabaseServer.js", "src/components/AuthScreen.js"]) {
    const source = read(path);
    assert.doesNotMatch(source, /legacyAccess/);
    assert.match(source, /permissions could not be verified/i);
  }
  const guard = read("src/lib/authClient.js");
  assert.doesNotMatch(guard, /legacyAccess/);
  assert.match(guard, /error=permissions/);
});

test("activity ingestion can validate the original ended session before bounded offline checks", () => {
  const source = read("src/app/api/activity/ingest/route.js");
  assert.match(source, /requireOwnedSession\(session\.client, session\.profile\.id, body\.trackingSessionId\)/);
  assert.doesNotMatch(source, /requireOwnedSession\([^;]+active:\s*true/);
  assert.match(source, /offline_sync_limit_seconds/);
});

test("team activity heartbeat and sample state must match the active session", () => {
  const team = read("src/app/api/activity/team/route.js");
  const employee = read("src/app/api/activity/employees/[employeeId]/route.js");
  assert.match(team, /function firstMatchingSession/);
  assert.match(team, /row\.tracking_session_id === activeSession\.id/);
  assert.match(employee, /item\.tracking_session_id === currentSession\.id/);
  assert.match(employee, /item\.device_id === currentSession\.device_id/);
});

test("employee application percentages use the selected range total", () => {
  const source = read("src/components/activity/EmployeeActivityPage.js");
  assert.match(source, /const rangeTrackedSeconds = useMemo/);
  assert.match(source, /trackedSeconds={rangeTrackedSeconds}/);
});

test("manager dashboard exposes service failures and uses the workspace day", () => {
  const source = read("src/components/ManagerWorkspace.js");
  assert.doesNotMatch(source, /\.catch\(\(\) => \(\{ data: \[\] \}\)\)/);
  assert.match(source, /function localDayKey/);
  assert.match(source, /Some services could not be loaded/);
  assert.match(source, /Unavailable totals are shown as dashes/);
});

test("the dynamic role route rejects unknown portals", () => {
  const source = read("src/app/[role]/layout.js");
  assert.match(source, /new Set\(\["employee", "manager", "admin"\]\)/);
  assert.match(source, /if \(!validRoles\.has\(role\)\) notFound\(\)/);
});

test("new session policy migration records an immutable policy version", () => {
  const source = read("supabase/migrations/202608030001_activity_session_policy_snapshot.sql");
  assert.match(source, /monitoring_policy_id uuid/);
  assert.match(source, /monitoring_policy_version integer/);
  assert.match(source, /references public\.monitoring_policies\(id, policy_version\)/);
  assert.match(source, /policy\.id, policy\.policy_version/);
});

test("offline ingestion accepts only bounded samples from the original session", () => {
  const source = read("supabase/migrations/202608030002_activity_offline_session_ingestion.sql");
  assert.match(source, /tracking_session\.status not in \('active','ended'\)/);
  assert.match(source, /captured_at > tracking_session\.ended_at/);
  assert.match(source, /OFFLINE_SYNC_EXPIRED/);
  assert.match(source, /tracking_session\.monitoring_policy_id/);
  assert.match(source, /on conflict on constraint activity_samples_device_id_local_sample_id_key do nothing/);
});

test("website ingestion accepts only bounded domain samples from the original session", () => {
  const route = read("src/app/api/activity/websites/ingest/route.js");
  const source = read("supabase/migrations/202608030005_website_offline_session_ingestion.sql");
  assert.match(route, /requireOwnedSession\([\s\S]*body\.trackingSessionId\s*\)/);
  assert.doesNotMatch(route, /requireOwnedSession\([^;]+active:\s*true/);
  assert.match(source, /tracking_session\.status not in \('active','ended'\)/);
  assert.match(source, /tracking_session\.monitoring_policy_id/);
  assert.match(source, /captured_at > tracking_session\.ended_at/);
  assert.match(source, /OFFLINE_SYNC_EXPIRED/);
  assert.match(source, /FORBIDDEN_FIELD/);
  assert.match(source, /on conflict on constraint website_activity_samples_employee_id_local_sample_id_key do nothing/);
});

test("daily summaries use each tracking session policy", () => {
  const source = read("supabase/migrations/202608030003_activity_policy_aware_summaries.sql");
  assert.match(source, /session\.monitoring_policy_id/);
  assert.match(source, /policy\.sample_interval_seconds/);
  assert.match(source, /policy\.idle_threshold_seconds/);
  assert.doesNotMatch(source, /where item\.is_active/);
});

test("stale-session maintenance is server-only and audited", () => {
  const source = read("supabase/migrations/202608030004_activity_stale_session_timeout.sql");
  assert.match(source, /end_source = 'timeout'/);
  assert.match(source, /session\.timed_out/);
  assert.match(source, /revoke all on function public\.activity_close_stale_sessions\(\) from authenticated/);
  assert.match(source, /grant execute on function public\.activity_close_stale_sessions\(\) to service_role/);
});
