import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = path => readFileSync(join(root, path), "utf8");

const migration = read("supabase/migrations/202609280001_agent_tamper_alerts.sql");
const eventsRoute = read("src/app/api/activity/agent-events/route.js");
const notificationsRoute = read("src/app/api/notifications/route.js");
const agentApi = read("desktop-agent/src/lib/api.js");
const agentApp = read("desktop-agent/src/App.jsx");

test("migration is detection-only and never conceals or blocks removal", () => {
  assert.match(migration, /DETECTION-and-NOTIFICATION system, not a concealment/i);
  // The durable event log carries the five expected signals.
  for (const type of ["heartbeat_gap", "signout_blocked", "quit_blocked", "uninstall_attempt", "agent_stopped"]) {
    assert.match(migration, new RegExp(`'${type}'`));
  }
});

test("the detector opens gap events for expected-online agents and resolves on recovery", () => {
  assert.match(migration, /create or replace function public\.activity_detect_agent_tamper\(\)/);
  // Expected-online = corporate device or a device with an open tracking session.
  assert.match(migration, /d\.agent_mode = 'corporate'/);
  assert.match(migration, /ts\.status = 'active'/);
  // Idempotent: does not re-open while an unresolved gap already exists.
  assert.match(migration, /not exists \(\s*select 1 from public\.agent_tamper_events e/);
  // Resolves when the device reports again.
  assert.match(migration, /update public\.agent_tamper_events set resolved_at = now\(\)/);
});

test("the detector runs every minute via Supabase Cron and stays server-only", () => {
  assert.match(migration, /cron\.schedule\(\s*'fieldflow-detect-agent-tamper',\s*'\* \* \* \* \*'/);
  assert.match(migration, /revoke all on function public\.activity_detect_agent_tamper\(\) from public, authenticated/);
});

test("the client report RPC enforces device ownership and notifies monitors", () => {
  assert.match(migration, /from public\.employee_devices\s*\n\s*where id = p_device_id and employee_id = auth\.uid\(\)/);
  assert.match(migration, /perform public\.activity_notify_monitors\(auth\.uid\(\)/);
  assert.match(migration, /grant execute on function public\.activity_report_agent_event\(uuid,text,jsonb\) to authenticated/);
});

test("monitor fan-out targets supervisors and monitoring administrators only", () => {
  assert.match(migration, /t\.supervisor_id = auth\.uid\(\)|t\.supervisor_id user_id/);
  assert.match(migration, /has_permission_as\(p\.id, 'activity\.policies\.manage'\)/);
  assert.match(migration, /has_permission_as\(p\.id, 'activity\.view_all'\)/);
  assert.match(migration, /revoke all on function public\.activity_notify_monitors\(uuid,text,text,text,text,uuid\) from public, authenticated/);
});

test("the agent-events API validates reportable types and lists open events for monitors", () => {
  assert.match(eventsRoute, /REPORTABLE_EVENTS = \["signout_blocked", "quit_blocked", "uninstall_attempt", "agent_stopped"\]/);
  assert.match(eventsRoute, /ACTIVITY_PERMISSIONS\.viewSelf/); // POST scope
  assert.match(eventsRoute, /resolveActivityScope\(session, \{ allowSelf: false \}\)/); // GET scope
  assert.match(eventsRoute, /activity_report_agent_event/);
});

test("tamper alerts are merged into the notification feed and unread count", () => {
  assert.match(notificationsRoute, /agent_tamper_alerts/);
  assert.match(notificationsRoute, /mapAgentTamperAlert/);
  assert.match(notificationsRoute, /tamperUnreadCount \|\| 0/);
  // A missing table must not break the feed for deployments without the migration.
  assert.match(notificationsRoute, /MISSING_TABLE_CODES\.includes\(tamperAlertError\.code\)/);
});

test("the desktop agent reports blocked sign-out and quit on managed devices", () => {
  assert.match(agentApi, /reportAgentEvent: body => request\("\/api\/activity\/agent-events"/);
  assert.match(agentApp, /const reportAgentEvent = useCallback/);
  assert.match(agentApp, /if \(corporateMode\) await reportAgentEvent\("signout_blocked"/);
  assert.match(agentApp, /reportAgentEvent\("quit_blocked"/);
  // Reporting is best-effort and never breaks the UI.
  assert.match(agentApp, /agent_event_report_failed_/);
});
