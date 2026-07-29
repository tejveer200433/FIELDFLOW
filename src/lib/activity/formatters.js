export function formatDuration(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatElapsed(startedAt, now = Date.now()) {
  if (!startedAt) return "0m";
  return formatDuration(Math.floor((now - new Date(startedAt).getTime()) / 1000));
}

export function formatDateTime(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function formatRelativeTime(value, now = Date.now()) {
  if (!value) return "Never";
  const elapsed = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  if (elapsed < 60) return "Just now";
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h ago`;
  return `${Math.floor(elapsed / 86400)}d ago`;
}

export function formatInterval(value) {
  const seconds = Number(value) || 0;
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} ${seconds === 3600 ? "hour" : "hours"}`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} ${seconds === 60 ? "minute" : "minutes"}`;
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

export function formatPercentage(value) {
  return `${Math.max(0, Math.min(100, Number(value) || 0)).toFixed(0)}%`;
}

export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function dateRange(days) {
  const endDate = todayUtc();
  const start = new Date(`${endDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - Math.max(0, days - 1));
  return { startDate: start.toISOString().slice(0, 10), endDate };
}
