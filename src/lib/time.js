export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

export function durationSeconds(record, now = Date.now()) {
  if (record.checkInAt && !record.checkOutAt && !record.checkOut) {
    return Math.max(0, Math.floor((now - new Date(record.checkInAt).getTime()) / 1000));
  }
  if (Number.isFinite(Number(record.durationSeconds))) return Number(record.durationSeconds);
  if (record.checkInAt) {
    const end = record.checkOutAt ? new Date(record.checkOutAt).getTime() : now;
    return Math.max(0, Math.floor((end - new Date(record.checkInAt).getTime()) / 1000));
  }
  if (typeof record.hours === "string") {
    const hours = Number.parseFloat(record.hours);
    if (Number.isFinite(hours)) return Math.round(hours * 3600);
  }
  return 0;
}
