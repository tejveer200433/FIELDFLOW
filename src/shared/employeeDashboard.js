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
