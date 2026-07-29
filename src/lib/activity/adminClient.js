"use client";

import { authenticatedFetch } from "@/lib/apiClient";
import { ActivityApiError } from "@/lib/activity/client";
import { getEmployeeActivityDetails, getTeamActivity } from "@/lib/activity/managerClient";

async function adminActivityRequest(path) {
  const response = await authenticatedFetch(`/api/activity${path}`, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    throw new ActivityApiError(
      payload.error?.code,
      payload.error?.message || `The workforce activity request failed (${response.status}).`,
      response.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null
    );
  }
  return payload.data;
}

export async function getWorkforceActivity(filters = {}) {
  const [team, directory] = await Promise.all([
    getTeamActivity(filters),
    getWorkforceDirectory({ search: filters.search, limit: 100 })
  ]);
  const profiles = new Map(directory.employees.map(employee => [employee.employeeId, employee]));
  return {
    ...team,
    employees: team.employees.map(employee => ({
      ...employee,
      department: profiles.get(employee.employeeId)?.department || null,
      email: profiles.get(employee.employeeId)?.email || null
    }))
  };
}

export function getWorkforceDirectory({ search = "", cursor = "", limit = 100 } = {}) {
  const query = new URLSearchParams({ limit: String(Math.max(1, Math.min(100, Number(limit) || 100))) });
  if (search.trim()) query.set("search", search.trim().slice(0, 120));
  if (cursor) query.set("cursor", cursor);
  return adminActivityRequest(`/employees?${query}`);
}

export function getWorkforceEmployeeDetails(employeeId, filters = {}) {
  return getEmployeeActivityDetails(employeeId, filters);
}

export function getWorkforceDevices({ status = "", cursor = "", limit = 50 } = {}) {
  const query = new URLSearchParams({ limit: String(Math.max(1, Math.min(100, Number(limit) || 50))) });
  if (["pending", "active", "revoked"].includes(status)) query.set("status", status);
  if (cursor) query.set("cursor", cursor);
  return adminActivityRequest(`/devices?${query}`);
}

export class UnsupportedActivityReadError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedActivityReadError";
    this.code = "ACTIVITY_API_NOT_AVAILABLE";
  }
}

export function getMonitoringAuditLog() {
  return Promise.reject(new UnsupportedActivityReadError("Phase 2 does not provide an activity audit-log read endpoint."));
}
