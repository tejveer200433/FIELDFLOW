"use client";

import { authenticatedFetch } from "@/lib/apiClient";
import { ActivityApiError, getActivePolicy } from "@/lib/activity/client";

const allowedStatuses = new Set(["active", "idle", "offline", "not_tracking"]);
const allowedSorts = new Set(["name", "last_seen", "activity"]);

async function managerActivityRequest(path) {
  const response = await authenticatedFetch(`/api/activity${path}`, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    throw new ActivityApiError(
      payload.error?.code,
      payload.error?.message || `The team activity request failed (${response.status}).`,
      response.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null
    );
  }
  return payload.data;
}

export function getTeamActivity({
  status = "",
  date = "",
  sort = "name",
  cursor = "",
  limit = 25
} = {}) {
  const query = new URLSearchParams({
    limit: String(Math.max(1, Math.min(100, Number(limit) || 25))),
    sort: allowedSorts.has(sort) ? sort : "name"
  });
  if (allowedStatuses.has(status)) query.set("status", status);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) query.set("date", date);
  if (cursor) query.set("cursor", cursor);
  return managerActivityRequest(`/team?${query}`);
}

export function getTeamActivitySummary(filters = {}) {
  return getTeamActivity(filters);
}

export function getEmployeeActivityDetails(employeeId, {
  startDate,
  endDate,
  cursor = "",
  limit = 50
} = {}) {
  const query = new URLSearchParams({ limit: String(Math.max(1, Math.min(90, Number(limit) || 50))) });
  if (/^\d{4}-\d{2}-\d{2}$/.test(startDate || "")) query.set("startDate", startDate);
  if (/^\d{4}-\d{2}-\d{2}$/.test(endDate || "")) query.set("endDate", endDate);
  if (cursor) query.set("cursor", cursor);
  return managerActivityRequest(`/employees/${encodeURIComponent(employeeId)}?${query}`);
}

export function getEmployeeActivityTimeline(employeeId, filters = {}) {
  return getEmployeeActivityDetails(employeeId, filters);
}

export { getActivePolicy as getTeamMonitoringPolicy };
