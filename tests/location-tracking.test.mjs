import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("location writes use the authenticated profile and require an open attendance shift", async () => {
  const route = await read("src/app/api/locations/route.js");
  assert.match(route, /requirePermission\(request, "locations\.share_self"\)/);
  assert.match(route, /employee_id: profile\.id/);
  assert.match(route, /from\("attendance_shifts"\)[\s\S]*is\("check_out_at", null\)/);
  assert.match(route, /requires an active attendance shift/);
  assert.doesNotMatch(route, /body\.employeeId|body\.name/);
});

test("manager live map excludes stale sharing records", async () => {
  const route = await read("src/app/api/locations/route.js");
  assert.match(route, /LIVE_WINDOW_MS = 2 \* 60 \* 1000/);
  assert.match(route, /\.gte\("updated_at", liveSince\)/);
});

test("employee check-in is committed before live sharing begins", async () => {
  const attendance = await read("src/frontend/features/attendance/components/EmployeeAttendance.js");
  const attendanceRequest = attendance.indexOf('apiJson("/api/attendance"');
  const trackingStart = attendance.indexOf("tracking.startTracking(location)");
  assert.ok(attendanceRequest > -1);
  assert.ok(trackingStart > attendanceRequest);
  assert.match(attendance, /const location = await tracking\.getPosition\(\)/);
});

test("web tracking contains no demo identity and retries after connectivity resumes", async () => {
  const context = await read("src/frontend/features/activity/context/EmployeeTrackingContext.js");
  assert.doesNotMatch(context, /employee-demo|Aarav Sharma|employeeId:/);
  assert.match(context, /apiJson\("\/api\/locations"/);
  assert.match(context, /window\.addEventListener\("online", resume\)/);
  assert.match(context, /document\.addEventListener\("visibilitychange", resumeWhenVisible\)/);
  assert.match(context, /navigator\.onLine \? "error" : "offline"/);
});
