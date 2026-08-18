import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = path => readFileSync(join(root, path), "utf8");
const route = read("src/app/api/timesheets/route.js");
const workspace = read("src/frontend/features/manager/components/ManagerWorkspace.js");

test("payroll exports enforce attendance scope before reading shifts", () => {
  assert.match(route, /requireAnyPermission\(request, \["attendance\.view_team", "attendance\.view_all"\]\)/);
  assert.match(route, /resolveUserScope\(session, \{ team: "attendance\.view_team", all: "attendance\.view_all" \}\)/);
  assert.match(route, /assertUserInScope\(scope, employeeId\)/);
  assert.match(route, /teamUserIds\.filter\(id => scope\.userIds\.includes\(id\)\)/);
  assert.match(route, /query = query\.in\("employee_id", scopedUserIds\)/);
});

test("payroll exports are date-bounded, row-bounded, and spreadsheet-safe", () => {
  assert.match(route, /MAX_EXPORT_DAYS = 366/);
  assert.match(route, /MAX_EXPORT_ROWS = 5000/);
  assert.match(route, /\.gte\("work_date", from\)/);
  assert.match(route, /\.lte\("work_date", to\)/);
  assert.match(route, /if \(\/\^\[=\+\\-@\]\/\.test\(text\)\) text = `'/);
  for (const heading of ["Regular hours", "Overtime hours", "Break hours", "Total worked hours"]) {
    assert.match(route, new RegExp(`"${heading}"`));
  }
});

test("manager reports expose payroll export only to attendance viewers", () => {
  assert.match(workspace, /function Reports\(\{ access \}\)/);
  assert.match(workspace, /hasAnyPermission\(access, \[PERMISSIONS\.attendanceViewTeam, PERMISSIONS\.attendanceViewAll\]\)/);
  assert.match(workspace, /authenticatedFetch\(`\/api\/timesheets\?\$\{params\}`/);
  assert.match(workspace, /Export payroll CSV/);
  assert.match(workspace, /<Reports access=\{access\} \/>/);
});
