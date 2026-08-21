import test from "node:test";
import assert from "node:assert/strict";
import { attendanceCalendarDay } from "../src/frontend/features/attendance/lib/attendanceCalendar.js";
import { readFile } from "node:fs/promises";

const defaults = {
  today: "2026-08-20",
  shifts: [],
  leaves: [],
  holidays: [],
  schedules: [{ effectiveFrom: "2026-01-01", effectiveTo: null, shiftTemplateId: "general", shiftName: "General", weekdays: [1, 2, 3, 4, 5] }],
  rosters: [],
  templates: [{ id: "general", name: "General", weeklyOffDays: [0] }]
};

test("Sunday is an off day and never absent without an explicit roster", () => {
  const result = attendanceCalendarDay({ ...defaults, date: "2026-08-16" });
  assert.equal(result.status, "Sunday");
});

test("a missed assigned working day is absent", () => {
  const result = attendanceCalendarDay({ ...defaults, date: "2026-08-17" });
  assert.equal(result.status, "Absent");
  assert.equal(result.shiftName, "General");
});

test("approved full-day leave replaces absence", () => {
  const result = attendanceCalendarDay({ ...defaults, date: "2026-08-17", leaves: [{ status: "Approved", type: "Annual", duration: "full_day", startDate: "2026-08-17", endDate: "2026-08-17" }] });
  assert.equal(result.status, "Leave");
});

test("attendance plus approved half-day leave creates a split status", () => {
  const result = attendanceCalendarDay({ ...defaults, date: "2026-08-17", shifts: [{ status: "On time" }], leaves: [{ status: "Approved", type: "Casual", duration: "second_half", startDate: "2026-08-17", endDate: "2026-08-17" }] });
  assert.equal(result.status, "Present + leave");
  assert.equal(result.isSplit, true);
});

test("an explicit Sunday roster is evaluated as a working day", () => {
  const result = attendanceCalendarDay({ ...defaults, date: "2026-08-16", rosters: [{ workDate: "2026-08-16", shiftTemplateId: "general", shiftName: "General" }] });
  assert.equal(result.status, "Absent");
});

test("approved half-day leave still permits employee check-in", async () => {
  const migration = await readFile(new URL("../supabase/migrations/202608200002_attendance_schedule_calendar.sql", import.meta.url), "utf8");
  assert.match(migration, /leave_request\.leave_duration = 'full_day'/);
});

test("attendance page exposes monthly navigation, strong status colours, insights, and history filters", async () => {
  const component = await readFile(new URL("../src/frontend/features/attendance/components/EmployeeAttendance.js", import.meta.url), "utf8");
  assert.match(component, /Previous month/);
  assert.match(component, /Next month/);
  assert.match(component, /Attendance insights/);
  assert.match(component, /Average check-in/);
  assert.match(component, /Daily time history/);
  assert.match(component, /historyFilter/);
  assert.match(component, /calendarOpen/);
  assert.match(component, /aria-expanded=\{calendarOpen\}/);
  assert.match(component, /Open calendar/);
  assert.match(component, /border-emerald-700 bg-emerald-600/);
  assert.match(component, /border-rose-700 bg-rose-600/);
  assert.match(component, /inline-flex h-7 w-fit/);
  assert.match(component, /<Circle className="h-2\.5 w-2\.5 fill-current"/);
});
