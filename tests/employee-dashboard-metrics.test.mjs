import test from "node:test";
import assert from "node:assert/strict";
import { breakDurationSeconds, dashboardTaskStats, localDateKey, plannedShiftSeconds, startOfLocalWeek, weeklyWorkStats, workedDurationSeconds } from "../src/shared/employeeDashboard.js";

test("active breaks pause employee worked time", () => {
  const now = Date.parse("2026-08-20T10:30:00.000Z");
  const shift = { id: "shift-1", checkInAt: "2026-08-20T09:00:00.000Z", checkOutAt: null };
  const breaks = [{ shiftId: "shift-1", startedAt: "2026-08-20T10:00:00.000Z", endedAt: null }];

  assert.equal(workedDurationSeconds(shift, breaks, now), 3600);
  assert.equal(workedDurationSeconds(shift, breaks, now + 15 * 60 * 1000), 3600);
});

test("paid breaks remain worked time while unpaid breaks are deducted", () => {
  const now = Date.parse("2026-08-20T11:00:00.000Z");
  const shift = { id: "shift-1", checkInAt: "2026-08-20T09:00:00.000Z", checkOutAt: null };
  const breaks = [
    { shiftId: "shift-1", breakType: "paid", startedAt: "2026-08-20T09:30:00.000Z", endedAt: "2026-08-20T09:45:00.000Z" },
    { shiftId: "shift-1", breakType: "unpaid", startedAt: "2026-08-20T10:00:00.000Z", endedAt: "2026-08-20T10:30:00.000Z" }
  ];

  assert.equal(workedDurationSeconds(shift, breaks, now), 90 * 60);
  assert.equal(breakDurationSeconds(shift, breaks, now, "unpaid"), 30 * 60);
});

test("completed shifts use the server's break-adjusted worked minutes", () => {
  const shift = {
    id: "shift-1",
    checkInAt: "2026-08-20T09:00:00.000Z",
    checkOutAt: "2026-08-20T17:00:00.000Z",
    workedMinutes: 420
  };

  assert.equal(workedDurationSeconds(shift), 420 * 60);
});

test("today's completion excludes past, future, and unscheduled tasks", () => {
  const today = new Date(2026, 7, 20, 12, 0, 0);
  const tasks = [
    { id: "today-complete", scheduledAt: new Date(2026, 7, 20, 9).toISOString(), status: "Completed" },
    { id: "today-open", scheduledAt: new Date(2026, 7, 20, 14).toISOString(), status: "In Progress" },
    { id: "past", scheduledAt: new Date(2026, 7, 19, 9).toISOString(), status: "Completed" },
    { id: "future", scheduledAt: new Date(2026, 7, 21, 9).toISOString(), status: "Completed" },
    { id: "unscheduled", scheduledAt: null, status: "Assigned" }
  ];
  const result = dashboardTaskStats(tasks, today);

  assert.deepEqual(result.today.map(item => item.id), ["today-complete", "today-open"]);
  assert.equal(result.completion, 50);
  assert.deepEqual(result.active.map(item => item.id), ["today-open", "unscheduled"]);
});

test("dashboard date keys use the employee's local calendar day", () => {
  assert.equal(localDateKey(new Date(2026, 7, 5, 23, 30)), "2026-08-05");
});

test("planned shift goals exclude the unpaid break", () => {
  assert.equal(plannedShiftSeconds({ startTime: "09:00", endTime: "17:30", unpaidBreakMinutes: 30 }), 8 * 60 * 60);
  assert.equal(plannedShiftSeconds({ startTime: "22:00", endTime: "06:00", unpaidBreakMinutes: 60 }), 7 * 60 * 60);
});

test("weekly work stats use Monday through Friday and real attendance", () => {
  const compare = new Date(2026, 7, 21, 12);
  const monday = startOfLocalWeek(compare);
  const attendance = [
    { id: "mon", date: localDateKey(monday), checkInAt: new Date(2026, 7, 17, 9).toISOString(), checkOutAt: new Date(2026, 7, 17, 17).toISOString(), workedMinutes: 480, status: "Present" },
    { id: "tue", date: "2026-08-18", checkInAt: new Date(2026, 7, 18, 9).toISOString(), checkOutAt: new Date(2026, 7, 18, 17).toISOString(), workedMinutes: 420, status: "Late" }
  ];
  const result = weeklyWorkStats(attendance, [], compare, compare.getTime());

  assert.deepEqual(result.days.map(day => day.label), ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  assert.equal(result.averageSeconds, 450 * 60);
  assert.equal(result.attendanceRate, 50);
});
