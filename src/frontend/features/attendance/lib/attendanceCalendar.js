function dateParts(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function activeSchedule(schedules, date) {
  return schedules
    .filter(item => item.effectiveFrom <= date && (!item.effectiveTo || item.effectiveTo >= date))
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] || null;
}

export function attendanceCalendarDay({ date, today, shifts, leaves, holidays, schedules, rosters, templates }) {
  const weekday = dateParts(date).getDay();
  const roster = rosters.find(item => item.workDate === date) || null;
  const schedule = activeSchedule(schedules, date);
  const assignment = roster || schedule;
  const template = templates.find(item => item.id === assignment?.shiftTemplateId) || null;
  const holiday = holidays.find(item => item.date === date) || null;
  const leave = leaves.find(item => item.status === "Approved" && item.startDate <= date && item.endDate >= date) || null;
  const partialLeave = leave && leave.duration && leave.duration !== "full_day";
  const hasShift = shifts.length > 0;
  const isSundayOff = weekday === 0 && !roster;
  const isWeeklyOff = !roster && Boolean(schedule) && (
    !schedule.weekdays.includes(weekday) || template?.weeklyOffDays?.includes(weekday)
  );
  const isWorkingDay = Boolean(roster) || Boolean(schedule && !isSundayOff && !isWeeklyOff);

  let status;
  if (hasShift && partialLeave) status = "Present + leave";
  else if (hasShift) status = shifts.some(item => item.status === "Late") ? "Late" : "Present";
  else if (leave && !partialLeave) status = "Leave";
  else if (leave) status = "Partial leave";
  else if (holiday) status = "Holiday";
  else if (isSundayOff) status = "Sunday";
  else if (isWeeklyOff) status = "Weekly off";
  else if (date < today && isWorkingDay) status = "Absent";
  else if (isWorkingDay) status = "Scheduled";
  else status = "Not scheduled";

  return {
    date,
    status,
    shiftName: assignment?.shiftName || template?.name || null,
    leaveType: leave?.type || null,
    leaveDuration: leave?.duration || null,
    isSplit: status === "Present + leave"
  };
}

export function calendarMonthDates(now) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const count = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: count }, (_, index) => {
    const value = new Date(year, month, index + 1, 12);
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`;
    return { date, day: index + 1, weekday: value.getDay() };
  });
}

export function leaveDurationLabel(value) {
  if (value === "first_half") return "First half";
  if (value === "second_half") return "Second half";
  return "Full day";
}
