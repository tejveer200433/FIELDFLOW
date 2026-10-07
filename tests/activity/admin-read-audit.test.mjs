import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = path => readFileSync(join(root, path), "utf8");

const migration = read("supabase/migrations/202610060001_admin_read_audit.sql");
const screenshotRoute = read("src/app/api/activity/screenshots/signed-url/route.js");
const employeeRoute = read("src/app/api/activity/employees/[employeeId]/route.js");
const auditRoute = read("src/app/api/activity/audit/route.js");

test("read-access logging skips self-views and enforces a real view entitlement", () => {
  assert.match(migration, /create or replace function public\.activity_log_read_access/);
  // Self-view is a no-op (not an oversight event).
  assert.match(migration, /if p_employee_id = auth\.uid\(\) then\s*\n\s*return null;/);
  // Cross-employee reads require owner/view_all/policies.manage or team supervision.
  assert.match(migration, /is_owner\(auth\.uid\(\)\)/);
  assert.match(migration, /has_permission\('activity\.view_team'\) and public\.is_team_supervisor_for\(p_employee_id\)/);
  assert.match(migration, /raise exception 'Read audit scope denied'/);
  // Same sensitive-field guard as the main audit writer.
  assert.match(migration, /'typedText','clipboard','screenshot'/);
});

test("the admin-activity feed is owner/admin-only and shows cross-subject rows", () => {
  assert.match(migration, /create or replace function public\.activity_admin_audit/);
  assert.match(migration, /a\.actor_user_id is distinct from a\.employee_id/);
  assert.match(migration, /revoke all on function public\.activity_admin_audit\(integer,integer\) from public, authenticated/);
  assert.match(migration, /grant execute on function public\.activity_admin_audit\(integer,integer\) to authenticated/);
});

test("viewing another employee's screenshot is logged, best-effort via try/catch", () => {
  assert.match(screenshotRoute, /select\("id,employee_id"\)/);
  assert.match(screenshotRoute, /screenshot\.employee_id !== session\.profile\.id/);
  assert.match(screenshotRoute, /p_action: "screenshot\.viewed"/);
  // Must be wrapped in try/catch, NOT .catch() -- the rpc builder has no .catch.
  assert.match(screenshotRoute, /try\s*\{[\s\S]*activity_log_read_access[\s\S]*\}\s*catch/);
  assert.doesNotMatch(screenshotRoute, /activity_log_read_access[\s\S]*\.catch\(/);
});

test("viewing another employee's activity detail is logged, best-effort via try/catch", () => {
  assert.match(employeeRoute, /employeeId !== session\.profile\.id/);
  assert.match(employeeRoute, /p_action: "activity\.viewed"/);
  assert.match(employeeRoute, /try\s*\{[\s\S]*activity_log_read_access[\s\S]*\}\s*catch/);
  assert.doesNotMatch(employeeRoute, /activity_log_read_access[\s\S]*\.catch\(/);
});

test("the audit route exposes the owner admin-only feed", () => {
  assert.match(auditRoute, /adminOnly = params\.get\("adminOnly"\) === "true"/);
  assert.match(auditRoute, /activity_admin_audit/);
});
