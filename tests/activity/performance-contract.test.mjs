import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = path => readFileSync(join(root, path), "utf8");

test("employee activity details aggregate usage in the database instead of downloading raw sample pages", () => {
  const route = read("src/app/api/activity/employees/[employeeId]/route.js");
  const migration = read("supabase/migrations/202608260003_activity_usage_summary_performance.sql");
  assert.match(route, /rpc\("activity_employee_usage_summary"/);
  assert.doesNotMatch(route, /\.limit\(5000\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /is_team_supervisor_for\(p_employee_id\)/);
  assert.match(migration, /raw samples remain server-side/i);
});

test("manager report and expense polling is visibility-aware and bounded", () => {
  const workspace = read("src/frontend/features/manager/components/ManagerWorkspace.js");
  assert.doesNotMatch(workspace, /setInterval\(load, 5000\)/);
  assert.match(workspace, /document\.visibilityState === "visible"/);
  assert.match(workspace, /30000/);
});
