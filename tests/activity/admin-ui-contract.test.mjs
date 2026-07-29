import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = path => readFileSync(join(root, path), "utf8");
const workforce = read("src/components/activity/AdminWorkforceActivityPage.js");
const settings = read("src/components/activity/MonitoringSettingsPage.js");
const form = read("src/components/activity/MonitoringPolicyForm.js");
const devices = read("src/components/activity/MonitoringDeviceAdministration.js");
const shell = read("src/components/RoleShell.js");
const adminClient = read("src/lib/activity/adminClient.js");
const policyClient = read("src/lib/activity/policyClient.js");

test("admin routes use the existing guarded admin shell", () => {
  assert.match(read("src/app/admin/activity/page.js"), /<RoleShell role="admin"><AdminWorkforceActivityPage \/><\/RoleShell>/);
  assert.match(read("src/app/admin/monitoring-settings/page.js"), /<RoleShell role="admin"><MonitoringSettingsPage \/><\/RoleShell>/);
});

test("workforce and settings permissions are independent and Owner-aware", () => {
  assert.match(workforce, /access\?\.isOwner \|\| hasPermission\(access, "activity\.view_all"\)/);
  assert.match(settings, /access\?\.isOwner \|\| hasPermission\(access, "activity\.policies\.manage"\)/);
  assert.doesNotMatch(workforce, /activity\.view_team/);
  assert.match(workforce, /if \(!permitted\)[\s\S]*Module not available/);
  assert.match(settings, /if \(!permitted\)[\s\S]*Module not available/);
});

test("admin navigation appends both items and leaves manager Team Activity unchanged", () => {
  assert.match(shell, /\["activity", "Team Activity", Activity, \["activity\.view_team", "activity\.view_all"\]\]/);
  assert.match(shell, /\["activity", "Workforce Activity", Activity, \["activity\.view_all"\]\]/);
  assert.match(shell, /\["monitoring-settings", "Monitoring Settings", ShieldCheck, \["activity\.policies\.manage"\]\]/);
});

test("admin clients reuse authenticatedFetch and only call activity endpoints", () => {
  for (const source of [adminClient, policyClient]) {
    assert.match(source, /authenticatedFetch\(`\/api\/activity\$\{path\}`/);
    assert.doesNotMatch(source, /supabase|service.?role/i);
    assert.doesNotMatch(source, /\/api\/(attendance|locations|projects|tasks|rbac)/);
  }
});

test("unsupported administrative reads are explicit and never bypass the API", () => {
  assert.match(adminClient, /Phase 2 does not provide an activity audit-log read endpoint/);
  assert.match(policyClient, /Phase 2 exposes only the active policy/);
  assert.match(policyClient, /does not expose an acknowledgement-summary endpoint/);
  assert.match(read("src/components/activity/MonitoringAuditLog.js"), /does not expose a safe audit read endpoint/);
});

test("workforce filters reset pagination and polling cleans up", () => {
  const filters = read("src/components/activity/WorkforceActivityFilters.js");
  assert.match(filters, /window\.setTimeout\([\s\S]*350/);
  assert.match(filters, /window\.clearTimeout\(timer\)/);
  assert.match(workforce, /setNextCursor\(null\)/);
  assert.match(workforce, /document\.visibilityState === "visible"/);
  assert.match(workforce, /window\.clearInterval\(timer\)/);
  assert.match(workforce, /inFlight\.current/);
});

test("workforce UI is responsive and contains neutral status explanations", () => {
  const table = read("src/components/activity/WorkforceActivityTable.js");
  assert.match(table, /hidden overflow-x-auto lg:block/);
  assert.match(table, /lg:hidden/);
  assert.match(workforce, /should not be interpreted as a complete measure of productivity, performance, or work quality/);
  assert.doesNotMatch(workforce, /lazy|poor performer|unproductive/i);
});

test("sensitive fields and raw samples never render in admin components", () => {
  const sources = [
    workforce, settings, form, devices,
    read("src/components/activity/WorkforceActivityTable.js"),
    read("src/components/activity/WorkforceDevicePanel.js")
  ];
  for (const source of sources) {
    assert.doesNotMatch(source, /deviceIdentifier|identifierHash|typedText|keyCode|mouseCoordinates|keyboardEventCount|mouseEventCount|rawMetadata/);
  }
});

test("policy form requires confirmation for enabling and lower retention", () => {
  assert.match(form, /!policy\?\.trackingEnabled && values\.trackingEnabled/);
  assert.match(form, /window\.confirm/);
  assert.match(form, /values\.retentionDays < policy\.retentionDays/);
  assert.match(form, /policyChanges\(policy, values\)/);
  assert.match(settings, /updateMonitoringPolicy\(values\)/);
});

test("device revoke and reactivate require confirmation", () => {
  assert.match(devices, /window\.confirm/);
  assert.match(devices, /act\(device, "revoke"\)/);
  assert.match(devices, /act\(device, "reactivate"\)/);
  assert.match(settings, /revokeMonitoringDevice\(device\.deviceId\)/);
  assert.match(settings, /reactivateMonitoringDevice\(device\.deviceId\)/);
});

test("rate limit and concurrent server errors remain safe", () => {
  assert.match(adminClient, /response\.headers\.get\("Retry-After"\)/);
  assert.match(policyClient, /payload\.error\?\.message/);
  assert.doesNotMatch(settings, /console\.error|stack|SQL/);
});
