"use client";

import { authenticatedFetch } from "@/lib/apiClient";
import { ActivityApiError, getActivePolicy } from "@/lib/activity/client";
import { getWorkforceDevices, UnsupportedActivityReadError } from "@/lib/activity/adminClient";

async function policyRequest(path, init = {}) {
  const response = await authenticatedFetch(`/api/activity${path}`, {
    cache: "no-store",
    ...init
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    throw new ActivityApiError(
      payload.error?.code,
      payload.error?.message || `The monitoring settings request failed (${response.status}).`,
      response.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null
    );
  }
  return payload;
}

export const getMonitoringPolicy = getActivePolicy;

export function updateMonitoringPolicy(values) {
  return policyRequest("/policies", {
    method: "POST",
    body: JSON.stringify(values)
  });
}

export const getMonitoringDevices = getWorkforceDevices;

export function updateMonitoringDevice(deviceId, action) {
  return policyRequest(`/devices/${encodeURIComponent(deviceId)}`, {
    method: "PATCH",
    body: JSON.stringify({ action })
  });
}

export function revokeMonitoringDevice(deviceId) {
  return updateMonitoringDevice(deviceId, "revoke");
}

export function reactivateMonitoringDevice(deviceId) {
  return updateMonitoringDevice(deviceId, "reactivate");
}

export function getPolicyHistory() {
  return Promise.reject(new UnsupportedActivityReadError("Phase 2 exposes only the active policy, not policy history."));
}

export function getAcknowledgementSummary() {
  return Promise.reject(new UnsupportedActivityReadError("Phase 2 does not expose an acknowledgement-summary endpoint."));
}

export function getPolicyAuditLog() {
  return Promise.reject(new UnsupportedActivityReadError("Phase 2 does not expose an activity audit-log read endpoint."));
}
