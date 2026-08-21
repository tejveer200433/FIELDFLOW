import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dashboardUrl = new URL("../src/frontend/features/employee/components/EmployeeDashboard.js", import.meta.url);
const workspaceUrl = new URL("../src/frontend/features/employee/components/EmployeeWorkspace.js", import.meta.url);
const shellUrl = new URL("../src/frontend/components/layout/EmployeeShell.js", import.meta.url);
const pageHeaderUrl = new URL("../src/frontend/features/employee/components/EmployeePageHeader.js", import.meta.url);
const attendanceUrl = new URL("../src/frontend/features/attendance/components/EmployeeAttendance.js", import.meta.url);
const activityUrl = new URL("../src/frontend/features/activity/components/EmployeeActivityPage.js", import.meta.url);
const dashboardRouteUrl = new URL("../src/app/api/employee-dashboard/route.js", import.meta.url);

test("employee workday uses its scoped summary API without demo task identities", async () => {
  const [dashboard, workspace, dashboardRoute] = await Promise.all([
    readFile(dashboardUrl, "utf8"),
    readFile(workspaceUrl, "utf8"),
    readFile(dashboardRouteUrl, "utf8")
  ]);

  assert.match(dashboard, /access\?\.profile\?\.full_name/);
  assert.match(dashboard, /apiJson\(`\/api\/employee-dashboard\?day=/);
  assert.match(dashboardRoute, /requirePermission\(request, PERMISSIONS\.dashboardView\)/);
  assert.match(dashboardRoute, /from\("daily_reports"\)/);
  assert.match(dashboardRoute, /Promise\.allSettled/);
  assert.match(dashboardRoute, /employee_attendance_schedules/);
  assert.match(dashboardRoute, /attendance_rosters/);
  assert.match(dashboard, /Net worked today/);
  assert.match(dashboard, /Assigned shift/);
  assert.match(dashboard, /Gross elapsed/);
  assert.match(dashboard, /Break allowance exceeded/);
  assert.doesNotMatch(workspace, /employeeId:\s*"e-1"/);
  assert.doesNotMatch(workspace, /employee-demo/);
});

test("employee shell remains permission-filtered and responsive", async () => {
  const shell = await readFile(shellUrl, "utf8");

  assert.match(shell, /hasAnyPermission\(access, item\[3\]\)/);
  assert.match(shell, /aria-label="Employee navigation"/);
  assert.match(shell, /aria-label="Mobile employee navigation"/);
  assert.match(shell, /useNotifications\(\{ enabled: Boolean\(access\) \}\)/);
});

test("field and AI sections are contextual and never fabricate AI output", async () => {
  const dashboard = await readFile(dashboardUrl, "utf8");

  assert.match(dashboard, /const fieldTask = data\.tasks\.find/);
  assert.match(dashboard, /\{fieldTask && <section/);
  assert.match(dashboard, /AI assistance is not connected yet/);
  assert.match(dashboard, /<button disabled[^>]*>[\s\S]*?Plan My Day/);
});

test("employee feature pages share the workday visual system", async () => {
  const [header, workspace, attendance, activity] = await Promise.all([
    readFile(pageHeaderUrl, "utf8"),
    readFile(workspaceUrl, "utf8"),
    readFile(attendanceUrl, "utf8"),
    readFile(activityUrl, "utf8")
  ]);

  assert.match(header, /text-violet-600/);
  assert.match(workspace, /EmployeePageHeader/);
  assert.match(attendance, /EmployeePageHeader/);
  assert.match(activity, /EmployeePageHeader/);
  assert.match(workspace, /bg-violet-600/);
  assert.match(attendance, /bg-violet-600/);
});
