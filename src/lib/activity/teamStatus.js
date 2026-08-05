export const TEAM_ACTIVITY_STATUSES = ["active", "idle", "offline", "unreachable", "not_tracking"];

export function isTeamActivityStatus(value) {
  return TEAM_ACTIVITY_STATUSES.includes(value);
}

export function statusTone(status) {
  return {
    active: "emerald",
    idle: "amber",
    offline: "slate",
    unreachable: "rose",
    not_tracking: "blue"
  }[status] || "slate";
}

export function effectiveDeviceStatus(row) {
  if (row?.currentStatus === "offline" && row?.activeSessionId) return "offline";
  return row?.deviceStatus || "";
}

export function filterLoadedTeamRows(rows, { search = "", deviceStatus = "" } = {}) {
  const term = search.trim().toLowerCase();
  return (rows || []).filter(row => {
    if (term && !String(row.employeeName || "").toLowerCase().includes(term)) return false;
    if (deviceStatus && effectiveDeviceStatus(row) !== deviceStatus) return false;
    return true;
  });
}

export function mergeTeamPages(currentRows, nextRows) {
  const merged = new Map((currentRows || []).map(row => [row.employeeId, row]));
  for (const row of nextRows || []) merged.set(row.employeeId, row);
  return Array.from(merged.values());
}
