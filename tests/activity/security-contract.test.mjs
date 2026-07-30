import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const phaseOne = readFileSync(join(root, "supabase/migrations/202607280001_employee_activity_tracking.sql"), "utf8");
const phaseTwo = readFileSync(join(root, "supabase/migrations/202607280002_activity_api_functions.sql"), "utf8");
const hardening = readFileSync(join(root, "supabase/migrations/202607290001_activity_security_hardening.sql"), "utf8");
const summaries = readFileSync(join(root, "supabase/migrations/202607290002_activity_daily_summary_aggregation.sql"), "utf8");
const ingestionFix = readFileSync(join(root, "supabase/migrations/202607290003_activity_ingestion_conflict_fix.sql"), "utf8");
const websiteActivity = readFileSync(join(root, "supabase/migrations/202607300001_website_domain_activity.sql"), "utf8");
const routePaths = [
  "devices/route.js",
  "devices/register/route.js",
  "devices/[deviceId]/route.js",
  "sessions/start/route.js",
  "sessions/stop/route.js",
  "sessions/current/route.js",
  "ingest/route.js",
  "websites/ingest/route.js",
  "heartbeat/route.js",
  "team/route.js",
  "employees/route.js",
  "employees/[employeeId]/route.js",
  "policies/route.js",
  "policies/acknowledge/route.js"
];

test("all required activity route handlers exist and require server authentication", () => {
  for (const route of routePaths) {
    const source = readFileSync(join(root, "src/app/api/activity", route), "utf8");
    assert.match(source, /requireActivitySession\(/, route);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE|service.role|service_role/i, route);
  }
});

test("phase one keeps self, team, all and owner RLS separation", () => {
  assert.match(phaseOne, /employee_id = auth\.uid\(\)/);
  assert.match(phaseOne, /has_permission\('activity\.view_team'\)[\s\S]*is_team_supervisor_for\(employee_id\)/);
  assert.match(phaseOne, /has_permission\('activity\.view_all'\)/);
  assert.match(phaseOne, /is_owner\(auth\.uid\(\)\)/);
  assert.doesNotMatch(phaseOne, /using\s*\(\s*true\s*\)/i);
});

test("activity support RPCs enforce authenticated identity and never accept employee identity for self writes", () => {
  for (const functionName of [
    "activity_register_device",
    "activity_start_session",
    "activity_stop_session",
    "activity_acknowledge_policy",
    "activity_record_heartbeat"
  ]) assert.match(phaseTwo, new RegExp(`function public\\.${functionName}\\(`));
  assert.match(phaseTwo, /employee_id,\s*device_name[\s\S]*auth\.uid\(\)/);
  assert.match(phaseTwo, /where id=p_session_id and employee_id=auth\.uid\(\)/);
  const registerSignature = phaseTwo.match(
    /function public\.activity_register_device\(([\s\S]*?)\)\s*returns/
  );
  assert.ok(registerSignature);
  assert.doesNotMatch(registerSignature[1], /p_employee_id/);
});

test("audit RPC rejects sensitive metadata and audit table remains append-only", () => {
  for (const key of ["token", "deviceIdentifier", "typedText", "clipboard", "screenshot", "keystrokes"]) {
    assert.match(phaseTwo, new RegExp(`'${key}'`));
  }
  assert.match(phaseOne, /grant select on public\.activity_audit_logs to authenticated/);
  assert.doesNotMatch(phaseOne, /grant (insert|update|delete)[^;]*activity_audit_logs/i);
});

test("session, heartbeat and policy mutations use database time and transactional functions", () => {
  assert.match(phaseTwo, /set status='ended', ended_at=now\(\)/);
  assert.match(phaseOne, /recorded_at timestamptz not null default now\(\)/);
  assert.match(phaseTwo, /pg_advisory_xact_lock/);
  assert.match(phaseTwo, /update public\.monitoring_policies set is_active=false where is_active/);
});

test("ingestion is bounded and idempotent", () => {
  const route = readFileSync(join(root, "src/app/api/activity/ingest/route.js"), "utf8");
  assert.match(route, /throwActivityDatabaseError/);
  assert.match(route, /rpc\("activity_ingest_samples"/);
  assert.match(route, /rpc\("activity_refresh_daily_summaries"/);
  assert.match(route, /offline_sync_limit_seconds/);
  assert.match(route, /acceptedCount/);
  assert.match(route, /duplicateCount/);
  assert.match(route, /rejectedCount/);
  assert.match(hardening, /jsonb_array_length\(p_samples\) not between 1 and 100/);
  assert.match(hardening, /on conflict \(device_id, local_sample_id\) do nothing/);
});

test("daily summaries are recomputed from bounded authenticated activity data", () => {
  assert.match(summaries, /function public\.activity_refresh_daily_summaries\(/);
  assert.match(summaries, /employee uuid := auth\.uid\(\)/);
  assert.match(summaries, /p_end_date - p_start_date > 31/);
  assert.match(summaries, /public\.tracking_sessions/);
  assert.match(summaries, /public\.activity_samples/);
  assert.match(summaries, /policy\.idle_threshold_seconds/);
  assert.match(summaries, /on conflict \(employee_id, summary_date\) do update/);
  assert.match(summaries, /grant execute on function public\.activity_refresh_daily_summaries\(date,date\) to authenticated/);
});

test("ingestion conflict handling avoids PL/pgSQL variable ambiguity", () => {
  assert.match(ingestionFix, /create or replace function public\.activity_ingest_samples\(/);
  assert.match(
    ingestionFix,
    /on conflict on constraint activity_samples_device_id_local_sample_id_key do nothing/
  );
  assert.doesNotMatch(ingestionFix, /on conflict \(device_id, local_sample_id\)/);
});

test("direct authenticated activity writes are revoked after API hardening", () => {
  for (const table of [
    "monitoring_policies",
    "monitoring_policy_acknowledgements",
    "employee_devices",
    "tracking_sessions",
    "activity_samples",
    "agent_heartbeats"
  ]) {
    assert.match(hardening, new RegExp(`revoke [^;]+ on public\\.${table} from authenticated`));
  }
  assert.match(hardening, /employee_id = auth\.uid\(\)/);
  assert.match(hardening, /item\.device_id = device\.id/);
  assert.match(hardening, /policy\.offline_sync_limit_seconds/);
  assert.match(hardening, /activity_audit_metadata_has_no_sensitive_keys/);
});

test("website activity accepts hostnames only through an authenticated bounded RPC", () => {
  assert.match(websiteActivity, /domain !~ '\[\/\?:#@\]'/);
  assert.match(websiteActivity, /jsonb_array_length\(p_samples\) not between 1 and 100/);
  assert.match(websiteActivity, /active_session[\s\S]*employee_id=auth\.uid\(\)/);
  assert.match(websiteActivity, /on conflict\(employee_id,local_sample_id\) do nothing/);
  assert.match(websiteActivity, /revoke insert, update, delete on public\.website_activity_samples from authenticated/);
});
