import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../supabase/migrations/202608200001_attendance_reliability_and_insights.sql", import.meta.url);
const attendanceApiUrl = new URL("../src/app/api/attendance/route.js", import.meta.url);
const managementApiUrl = new URL("../src/app/api/attendance-management/route.js", import.meta.url);
const employeeUrl = new URL("../src/frontend/features/attendance/components/EmployeeAttendance.js", import.meta.url);
const managerUrl = new URL("../src/frontend/features/attendance/components/ManagerAttendance.js", import.meta.url);
const panelUrl = new URL("../src/frontend/features/attendance/components/AttendanceManagementPanel.js", import.meta.url);
const offlineUrl = new URL("../src/frontend/features/attendance/lib/offlineAttendance.js", import.meta.url);
const timesheetUrl = new URL("../src/app/api/timesheets/route.js", import.meta.url);

test("automatic checkout is policy-driven, visible, and audited", async () => {
  const [migration, api, employee] = await Promise.all([readFile(migrationUrl, "utf8"), readFile(attendanceApiUrl, "utf8"), readFile(employeeUrl, "utf8")]);
  assert.match(migration, /function public\.auto_close_overdue_attendance/);
  assert.match(migration, /checkout_source = 'automatic'/);
  assert.match(migration, /attendance_shift_audit/);
  assert.match(api, /auto_close_overdue_attendance/);
  assert.match(employee, /will close automatically/);
});

test("offline attendance events carry time, GPS, device identity, and idempotency keys", async () => {
  const [offline, api, migration] = await Promise.all([readFile(offlineUrl, "utf8"), readFile(attendanceApiUrl, "utf8"), readFile(migrationUrl, "utf8")]);
  assert.match(offline, /clientEventId: crypto\.randomUUID\(\)/);
  assert.match(offline, /capturedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(offline, /flushAttendanceQueue/);
  assert.match(api, /check_in_client_event_id/);
  assert.match(migration, /attendance_shift_check_in_event_uidx/);
});

test("paid and unpaid breaks have separate policy-aware handling", async () => {
  const [migration, api, employee] = await Promise.all([readFile(migrationUrl, "utf8"), readFile(managementApiUrl, "utf8"), readFile(employeeUrl, "utf8")]);
  assert.match(migration, /break_type text not null default 'unpaid'/);
  assert.match(migration, /when b\.break_type = 'unpaid'/);
  assert.match(api, /p_break_type: breakType/);
  assert.match(employee, /Start paid break/);
  assert.match(employee, /Start unpaid break/);
});

test("attendance anomalies cover time, break, location, travel, device, and offline risks", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  for (const type of ["late_arrival", "early_departure", "missed_checkout", "excessive_break", "long_shift", "unusual_location", "impossible_travel", "multiple_device", "offline_capture"]) {
    assert.match(migration, new RegExp(type));
  }
});

test("employee attendance exposes calendar, net summaries, reminders, and privacy", async () => {
  const [employee, migration] = await Promise.all([readFile(employeeUrl, "utf8"), readFile(migrationUrl, "utf8")]);
  assert.match(employee, /Track attendance and working hours/);
  assert.match(employee, /Gross \/ net time/);
  assert.match(employee, /attendance event.*waiting to sync/);
  assert.match(employee, /Detailed coordinates are retained/);
  assert.match(migration, /create_attendance_decision_reminder/);
});

test("manager attendance exposes live states, unified approvals, audit, and risk resolution", async () => {
  const [manager, panel, api] = await Promise.all([readFile(managerUrl, "utf8"), readFile(panelUrl, "utf8"), readFile(managementApiUrl, "utf8")]);
  assert.match(manager, /On break/);
  assert.match(manager, /Absent today/);
  assert.match(manager, /Location offline\/stale/);
  assert.match(manager, /Needs review/);
  assert.match(panel, /Attendance approval inbox/);
  assert.match(panel, /Approve all/);
  assert.match(panel, /Attendance audit history/);
  assert.match(api, /resolve-anomaly/);
  assert.match(api, /review-bulk/);
});

test("attendance exports include gross, net, automatic, offline, and risk fields safely", async () => {
  const [timesheet, panel] = await Promise.all([readFile(timesheetUrl, "utf8"), readFile(panelUrl, "utf8")]);
  assert.match(timesheet, /Gross shift hours/);
  assert.match(timesheet, /Checkout source/);
  assert.match(timesheet, /Risk flags/);
  assert.match(panel, /Department/);
  assert.match(panel, /if \(\/\^\[=\+\\-@\]\//);
});

test("privacy retention and risk-based evidence are permission scoped", async () => {
  const [migration, panel] = await Promise.all([readFile(migrationUrl, "utf8"), readFile(panelUrl, "utf8")]);
  assert.match(migration, /apply_attendance_privacy_retention/);
  assert.match(migration, /attendance_evidence/);
  assert.match(migration, /photo_evidence_risk_threshold/);
  assert.match(panel, /Privacy & risk|Attendance privacy controls/);
});
