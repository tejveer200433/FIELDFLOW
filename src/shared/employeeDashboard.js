const COMPLETED_STATUS = "Completed";

export function sameLocalDay(value, compare = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === compare.getFullYear()
    && date.getMonth() === compare.getMonth()
    && date.getDate() === compare.getDate();
}

export function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfLocalWeek(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  const weekday = date.getDay();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (weekday === 0 ? 6 : weekday - 1));
  return date;
}

export function plannedShiftSeconds(plan, fallbackSeconds = 8 * 60 * 60) {
  if (!plan?.startTime || !plan?.endTime) return fallbackSeconds;
  const [startHour, startMinute] = plan.startTime.split(":").map(Number);
  const [endHour, endMinute] = plan.endTime.split(":").map(Number);
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return fallbackSeconds;
  let minutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
  if (minutes <= 0) minutes += 24 * 60;
  minutes -= Math.max(0, Number(plan.unpaidBreakMinutes) || 0);
  return Math.max(60 * 60, minutes * 60);
}

export function workedDurationSeconds(record, breaks = [], now = Date.now()) {
  if (!record) return 0;
  const isClosed = Boolean(record.checkOutAt || record.checkOut);
  if (isClosed && Number(record.workedMinutes) > 0) {
    return Math.max(0, Math.round(Number(record.workedMinutes) * 60));
  }

  const start = new Date(record.checkInAt).getTime();
  if (!Number.isFinite(start)) return 0;
  const end = isClosed ? new Date(record.checkOutAt).getTime() : now;
  const elapsed = Math.max(0, Math.floor((end - start) / 1000));
  const breakSeconds = breakDurationSeconds(record, breaks, now, "unpaid");
  return Math.max(0, elapsed - breakSeconds);
}

export function breakDurationSeconds(record, breaks = [], now = Date.now(), breakType = null) {
  if (!record?.checkInAt) return 0;
  const start = new Date(record.checkInAt).getTime();
  if (!Number.isFinite(start)) return 0;
  const isClosed = Boolean(record.checkOutAt || record.checkOut);
  const end = isClosed ? new Date(record.checkOutAt).getTime() : now;
  return breaks
    .filter(item => item.shiftId === record.id && item.breakType !== "paid")
    .filter(item => !breakType || (item.breakType || "unpaid") === breakType)
    .reduce((total, item) => {
      const breakStart = Math.max(start, new Date(item.startedAt).getTime());
      const rawEnd = item.endedAt ? new Date(item.endedAt).getTime() : end;
      const breakEnd = Math.min(end, rawEnd);
      if (!Number.isFinite(breakStart) || !Number.isFinite(breakEnd)) return total;
      return total + Math.max(0, Math.floor((breakEnd - breakStart) / 1000));
    }, 0);
}

export function dashboardTaskStats(tasks, compare = new Date()) {
  const today = tasks.filter(task => sameLocalDay(task.scheduledAt, compare));
  const completedToday = today.filter(task => task.status === COMPLETED_STATUS);
  const active = tasks.filter(task => task.status !== COMPLETED_STATUS);
  return {
    today,
    completedToday,
    active,
    completion: today.length ? Math.round((completedToday.length / today.length) * 100) : null
  };
}

export function weeklyWorkStats(attendance, breaks = [], compare = new Date(), now = Date.now()) {
  const weekStart = startOfLocalWeek(compare);
  const days = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const records = attendance.filter(item => sameLocalDay(item.checkInAt || item.date, date));
    const seconds = records.reduce((total, record) => total + workedDurationSeconds(record, breaks, now), 0);
    return {
      key: localDateKey(date),
      label: date.toLocaleDateString("en", { weekday: "short" }),
      seconds,
      future: date > compare
    };
  });
  const workedDays = days.filter(day => day.seconds > 0);
  const relevantRecords = attendance.filter(item => {
    const date = new Date(item.checkInAt || item.date);
    return date >= weekStart && date <= compare;
  });
  const onTimeRecords = relevantRecords.filter(item => item.status !== "Late");
  return {
    days,
    averageSeconds: workedDays.length ? Math.round(workedDays.reduce((total, day) => total + day.seconds, 0) / workedDays.length) : 0,
    attendanceRate: relevantRecords.length ? Math.round((onTimeRecords.length / relevantRecords.length) * 100) : null
  };
}
