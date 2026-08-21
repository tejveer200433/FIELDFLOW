import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normalizeResourceKey, parseWebAccessRequest, parseWebAccessRule, parseWebAccessReview } from "../../src/backend/activity/webAccess.mjs";

test("web access resources are normalized without collecting URLs", () => {
  assert.equal(normalizeResourceKey("domain", "https://www.YouTube.com/watch?v=private"), "youtube.com");
  assert.equal(normalizeResourceKey("application", "WhatsApp.exe"), "whatsapp.exe");
});

test("a request supports website and native application access scopes", () => {
  const request = parseWebAccessRequest({ resourceType: "application", resourceKey: "Telegram", reason: "Customer support call", requestedMinutes: 30, requestedScope: "shift" });
  assert.equal(request.resourceKey, "telegram");
  assert.equal(request.requestedScope, "shift");
});

test("rules support organisation, team, role, employee and device scopes", () => {
  for (const scopeType of ["team", "role", "employee", "device"]) {
    const rule = parseWebAccessRule({ name: "Restricted", scopeType, scopeId: "11111111-1111-1111-1111-111111111111", blockedDomains: ["youtube.com"], blockedApplications: ["whatsapp"], scheduleStart: "09:00", scheduleEnd: "18:00" });
    assert.equal(rule.scopeType, scopeType);
  }
  assert.equal(parseWebAccessRule({ name: "Organisation", scopeType: "organisation", scheduleStart: "00:00", scheduleEnd: "23:59" }).scopeId, null);
});

test("employee and role policies accept multiple unique targets", () => {
  const targets = ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"];
  const employees = parseWebAccessRule({ name: "Employees", scopeType: "employee", scopeIds: [...targets, targets[0]], scheduleStart: "09:00", scheduleEnd: "18:00" });
  const roles = parseWebAccessRule({ name: "Roles", scopeType: "role", scopeIds: targets, scheduleStart: "09:00", scheduleEnd: "18:00" });
  assert.deepEqual(employees.scopeIds, targets);
  assert.deepEqual(roles.scopeIds, targets);
  assert.throws(() => parseWebAccessRule({ name: "Teams", scopeType: "team", scopeIds: targets, scheduleStart: "09:00", scheduleEnd: "18:00" }));
});

test("approval choices are bounded and explicit", () => {
  assert.equal(parseWebAccessReview({ id: "request-id", decision: "Approved", approvalScope: "seven_days", grantedMinutes: 30 }).approvalScope, "seven_days");
  assert.throws(() => parseWebAccessReview({ id: "request-id", decision: "Approved", approvalScope: "once", grantedMinutes: 1 }));
});

test("database controls are additive, scoped, and alert on extension health", () => {
  const migration = readFileSync("supabase/migrations/202608100001_web_access_control.sql", "utf8");
  assert.match(migration, /create table public\.web_access_rules/);
  assert.match(migration, /scope_type in \('organisation','team','role','employee','device'\)/);
  assert.match(migration, /web_access_request_created_trigger/);
  assert.match(migration, /web_access_expire_and_detect_stale_extensions/);
  assert.match(migration, /fieldflow-web-access-health/);
  assert.doesNotMatch(migration, /grant execute on function public\.web_access_notify_managers[^;]+to authenticated/);
});

test("monitoring views resolve employee and device names instead of rendering raw UUIDs", () => {
  const administration = readFileSync("src/frontend/features/activity/components/WebAccessAdministration.js", "utf8");
  const extensionHealth = readFileSync("src/app/api/activity/web-access/extension-health/route.js", "utf8");
  const events = readFileSync("src/app/api/activity/web-access/events/route.js", "utf8");
  const requests = readFileSync("src/app/api/activity/web-access/requests/route.js", "utf8");

  for (const route of [extensionHealth, events, requests]) {
    assert.match(route, /getActivityProfiles/);
    assert.match(route, /employeeName/);
  }
  assert.match(administration, /employeeLabel\(item\.employeeId, item\.employeeName\)/);
  assert.match(administration, /employeeLabel\(item\.employee_id, item\.employeeName\)/);
  assert.match(administration, /Device: \{deviceLabel\(item\.deviceId\)\}/);
  assert.match(administration, /ruleScopeLabel\(rule\)/);
  assert.doesNotMatch(administration, /employee \{item\.(employeeId|employee_id)\}/);
});
