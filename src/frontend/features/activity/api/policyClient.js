"use client";

import { authenticatedFetch } from "@/frontend/lib/apiClient";
import { ActivityApiError, getActivePolicy } from "@/frontend/features/activity/api/client";
import { getMonitoringAuditLog, getWorkforceDevices, UnsupportedActivityReadError } from "@/frontend/features/activity/api/adminClient";

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

export function setMonitoringDeviceMode(deviceId, mode) {
  return updateMonitoringDevice(deviceId, mode === "corporate" ? "set-corporate-mode" : "set-standard-mode");
}

export function setDeviceScreenshotCapture(deviceId, enabled) {
  return policyRequest(`/devices/${encodeURIComponent(deviceId)}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "set-screenshot-capture", screenshotCaptureEnabled: enabled })
  });
}

export function deleteActivityScreenshots(screenshotIds) {
  return policyRequest("/screenshots/delete", {
    method: "POST",
    body: JSON.stringify({ screenshotIds })
  });
}

export function requestDeviceScreenshot(deviceId) {
  return policyRequest("/screenshots/requests", { method: "POST", body: JSON.stringify({ deviceId }) });
}

export function getDeviceScreenshotRequest(deviceId) {
  return policyRequest(`/screenshots/requests?deviceId=${encodeURIComponent(deviceId)}`);
}

export function getBlocklistOverrideRequests() {
  return policyRequest("/blocklist-requests").then(payload => payload.data.requests);
}

export function reviewBlocklistRequest({ id, decision, grantedMinutes, comment }) {
  return policyRequest("/blocklist-requests", {
    method: "PATCH",
    body: JSON.stringify({ id, decision, grantedMinutes, comment })
  });
}

export function getPolicyHistory() {
  return Promise.reject(new UnsupportedActivityReadError("Phase 2 exposes only the active policy, not policy history."));
}

export function getAcknowledgementSummary() {
  return Promise.reject(new UnsupportedActivityReadError("Phase 2 does not expose an acknowledgement-summary endpoint."));
}

export const getPolicyAuditLog = getMonitoringAuditLog;
