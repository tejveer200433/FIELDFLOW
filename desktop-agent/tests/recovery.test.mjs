import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const native = readFileSync(new URL("../src-tauri/src/recovery.rs", import.meta.url), "utf8");
const nativeApp = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const instance = readFileSync(new URL("../src-tauri/src/instance.rs", import.meta.url), "utf8");
const cron = readFileSync(new URL("../../supabase/migrations/202608120001_activity_stale_session_cron.sql", import.meta.url), "utf8");

test("Windows recovery covers unlock and resume without a second logon owner", () => {
  const recoveryTemplate = native.slice(
    native.indexOf("fn recovery_task_xml"),
    native.indexOf("fn watchdog_task_xml"),
  );
  assert.doesNotMatch(recoveryTemplate, /<LogonTrigger>/);
  assert.match(native, /<StateChange>SessionUnlock<\/StateChange>/);
  assert.match(native, /Microsoft-Windows-Power-Troubleshooter/);
  assert.match(native, /<RestartOnFailure>/);
  assert.match(native, /<MultipleInstancesPolicy>Parallel<\/MultipleInstancesPolicy>/);
  assert.match(native, /--minimized --recovery/);
  assert.match(instance, /agent-resume-requested/);
  assert.match(nativeApp, /instance::acquire/);
  assert.match(instance, /CreateMutexW/);
  assert.match(instance, /ERROR_ALREADY_EXISTS/);
  assert.match(instance, /SecondarySignalled/);
});

test("the packaged agent repairs startup and recovery registration", () => {
  assert.match(app, /enableAutostart\(\)/);
  assert.doesNotMatch(app, /isAutostartEnabled/);
  assert.doesNotMatch(app, /disableAutostart\(\)/);
  assert.match(app, /invoke\("ensure_recovery_task"\)/);
  assert.match(native, /WATCHDOG_TASK_NAME/);
  assert.match(native, /<Interval>PT2M<\/Interval>/);
  assert.match(native, /<MultipleInstancesPolicy>IgnoreNew<\/MultipleInstancesPolicy>/);
  assert.match(native, /--minimized --watchdog/);
  assert.match(native, /\/Query/);
});

test("watchdog launches never construct a second WebView or rotate authentication", () => {
  assert.match(instance, /LaunchReason::Watchdog => \{\}/);
  assert.match(nativeApp, /SecondarySignalled\) => return/);
  assert.match(nativeApp, /"--minimized" \| "--recovery" \| "--watchdog"/);
});

test("system recovery refreshes authentication, policy, session, heartbeat and sync", () => {
  assert.doesNotMatch(app, /supabase\.auth\.startAutoRefresh\(\)/);
  assert.doesNotMatch(app, /supabase\.auth\.refreshSession\(\)/);
  assert.match(app, /sessionManager\.getValidSession\(\)/);
  assert.doesNotMatch(app, /getValidSession\(\{ forceRefresh: true \}\)/);
  assert.match(app, /const currentPolicy = await api\.getPolicy\(\)/);
  assert.match(app, /await reconcileWithServer\(currentPolicy\)/);
  assert.match(app, /force: true/);
  assert.match(app, /await performSync\(\)/);
  assert.match(app, /recoveryInFlight/);
  assert.match(app, /recoveryRetryTimer/);
  assert.match(app, /recoverAfterSystemActivityRef/);
});

test("stale activity sessions are closed every minute by server-side Cron", () => {
  assert.match(cron, /create extension if not exists pg_cron/);
  assert.match(cron, /fieldflow-close-stale-activity-sessions/);
  assert.match(cron, /\* \* \* \* \*/);
  assert.match(cron, /activity_close_stale_sessions\(\)/);
});
