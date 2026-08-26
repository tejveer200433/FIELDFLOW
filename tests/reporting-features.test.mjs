import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = path => readFileSync(join(root, path), "utf8");
const route = read("src/app/api/reports/route.js");
const workspace = read("src/frontend/features/manager/components/ManagerWorkspace.js");
const migration = read("supabase/migrations/202608130001_reporting_foundations.sql");
const presetsMigration = read("supabase/migrations/202608130005_report_presets.sql");
const presetsRoute = read("src/app/api/report-presets/route.js");

test("report filters are validated and applied after RBAC scope resolution", () => {
  assert.match(route, /const scope = await resolveUserScope/);
  assert.match(route, /optionalUuid\(params\.get\("employeeId"\), "Employee"\)/);
  assert.match(route, /optionalUuid\(params\.get\("teamId"\), "Team"\)/);
  assert.match(route, /optionalUuid\(params\.get\("taskId"\), "Task"\)/);
  assert.match(route, /optionalDate\(params\.get\("from"\), "Start date"\)/);
  assert.match(route, /optionalDate\(params\.get\("to"\), "End date"\)/);
  assert.match(route, /assertUserInScope\(scope, employeeId\)/);
  assert.match(route, /teamUserIds\.filter\(userId => scope\.userIds\.includes\(userId\)\)/);
  assert.match(route, /query = query\.eq\("status", status\)/);
  assert.match(route, /query = query\.gte\("report_date", from\)/);
  assert.match(route, /query = query\.lte\("report_date", to\)/);
});

test("report reads are bounded and expose pagination without changing report mutations", () => {
  assert.match(route, /Math\.min\(100, Math\.max\(1,/);
  assert.match(route, /query = format === "csv" \? query\.limit\(5000\) : query\.range\(offset, offset \+ limit\)/);
  assert.match(route, /pagination: \{ limit, offset, hasMore \}/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /notifyEvent\(client, \{/);
});

test("manager reports send filters to the API and keep polling overlap-safe", () => {
  assert.match(workspace, /new URLSearchParams\(\{ limit: "50", offset: String\(offset\) \}\)/);
  assert.match(workspace, /apiJson\(`\/api\/reports\?\$\{params\}`/);
  assert.match(workspace, /if \(inFlight\.current\) return/);
  assert.match(workspace, /document\.visibilityState === "visible"/);
  assert.match(workspace, /setInterval\(\(\) => \{ if \(document\.visibilityState === "visible"\) load\(\); \}, 30000\)/);
  for (const label of ["All teams", "All employees", "All tasks", "From", "To", "Reset filters"]) {
    assert.match(workspace, new RegExp(label));
  }
  assert.match(workspace, /pagination\.hasMore/);
});

test("filtered summaries are calculated under caller RLS", () => {
  assert.match(migration, /function public\.daily_report_summary/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /report\.employee_id = any\(p_employee_ids\)/);
  assert.match(migration, /report\.task_id = p_task_id/);
  assert.match(migration, /report\.report_date >= p_from/);
  assert.match(migration, /grant execute on function public\.daily_report_summary[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /security definer|service_role/);
  assert.match(route, /session\.client\.rpc\("daily_report_summary"/);
});

test("CSV exports reuse scoped filters and neutralize spreadsheet formulas", () => {
  assert.match(route, /if \(\/\^\[=\+\\-@\]\/.test\(text\)\) text = `'/);
  assert.match(route, /query\.limit\(5000\)/);
  assert.match(route, /Content-Disposition": "attachment; filename=fieldflow-reports\.csv"/);
  assert.match(workspace, /authenticatedFetch\(`\/api\/reports\?\$\{params\}`/);
  assert.match(workspace, /URL\.createObjectURL\(await response\.blob\(\)\)/);
  assert.match(workspace, /URL\.revokeObjectURL\(url\)/);
  assert.match(workspace, /Export CSV/);
});

test("saved report views and schedule definitions are private to their owner", () => {
  assert.match(presetsMigration, /owner_id uuid not null references public\.profiles/);
  assert.match(presetsMigration, /owner_id = auth\.uid\(\) and public\.has_permission\('reports\.review'\)/);
  assert.match(presetsMigration, /kind in \('view','schedule'\)/);
  assert.match(presetsRoute, /requirePermission\(request, "reports\.review"\)/);
  assert.match(presetsRoute, /allowedFilterKeys/);
  assert.match(presetsRoute, /emailPattern/);
  assert.match(presetsRoute, /frequencies\.includes\(body\.frequency\)/);
  assert.doesNotMatch(presetsRoute, /service.?role/i);
});

test("manager reports can save and apply views and schedule definitions", () => {
  assert.match(workspace, /apiJson\("\/api\/report-presets"/);
  assert.match(workspace, /savePreset\("view"\)/);
  assert.match(workspace, /savePreset\("schedule"\)/);
  assert.match(workspace, /setFilters\(current => \(\{ \.\.\.current, \.\.\.preset\.filters \}\)\)/);
  assert.match(workspace, /Create schedule/);
});
