import {
  dateRange,
  formatDateTime,
  formatDuration,
  formatElapsed,
  formatPercentage,
  formatRelativeTime,
  todayUtc
} from "@/lib/activity/formatters";

export {
  dateRange,
  formatDateTime,
  formatDuration,
  formatElapsed,
  formatPercentage,
  formatRelativeTime,
  todayUtc
};

export function statusLabel(status) {
  return {
    active: "Active",
    idle: "Idle",
    offline: "Offline",
    not_tracking: "Not tracking"
  }[status] || "Unknown";
}

export function shortIdentifier(value) {
  return value ? `${String(value).slice(0, 8)}…` : "None";
}

export function currentPageSummary(rows) {
  const summary = {
    active: 0,
    idle: 0,
    offline: 0,
    notTracking: 0,
    trackedSeconds: 0
  };
  for (const row of rows || []) {
    if (row.currentStatus === "active") summary.active += 1;
    else if (row.currentStatus === "idle") summary.idle += 1;
    else if (row.currentStatus === "offline") summary.offline += 1;
    else summary.notTracking += 1;
    summary.trackedSeconds += Number(row.trackedSecondsToday) || 0;
  }
  return summary;
}
