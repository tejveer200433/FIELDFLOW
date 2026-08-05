"use client";

import { authenticatedFetch } from "@/lib/apiClient";

export class ActivityApiError extends Error {
  constructor(code, message, status, retryAfterSeconds = null) {
    super(message);
    this.name = "ActivityApiError";
    this.code = code || "ACTIVITY_REQUEST_FAILED";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function activityRequest(path, init = {}) {
  const response = await authenticatedFetch(`/api/activity${path}`, {
    cache: "no-store",
    ...init
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    throw new ActivityApiError(
      payload.error?.code,
      payload.error?.message || `The activity request failed (${response.status}).`,
      response.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null
    );
  }
  return payload;
}

export function getActivePolicy() {
  return activityRequest("/policies").then(payload => payload.data);
}

export function acknowledgePolicy({ policyId, policyVersion, acknowledgementTextHash }) {
  return activityRequest("/policies/acknowledge", {
    method: "POST",
    body: JSON.stringify({ policyId, policyVersion, acknowledgementTextHash })
  });
}

export function getDevices(employeeId) {
  const query = new URLSearchParams({ employeeId, limit: "100" });
  return activityRequest(`/devices?${query}`).then(payload => payload.data);
}

export function getCurrentSession() {
  return activityRequest("/sessions/current").then(payload => payload.data);
}

export function startSession({ deviceId, projectId = null, taskId = null }) {
  return activityRequest("/sessions/start", {
    method: "POST",
    body: JSON.stringify({ deviceId, projectId, taskId, source: "web" })
  });
}

export function stopSession(sessionId) {
  return activityRequest("/sessions/stop", {
    method: "POST",
    body: JSON.stringify({ sessionId, source: "web" })
  });
}

export function getMyActivity(employeeId, { startDate, endDate, limit = 50 } = {}) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (startDate) query.set("startDate", startDate);
  if (endDate) query.set("endDate", endDate);
  return activityRequest(`/employees/${encodeURIComponent(employeeId)}?${query}`).then(payload => payload.data);
}

export function getBlocklistRequests() {
  return activityRequest("/blocklist-requests").then(payload => payload.data.requests);
}

export function createBlocklistRequest({ domain, reason, requestedMinutes = 30 }) {
  return activityRequest("/blocklist-requests", {
    method: "POST",
    body: JSON.stringify({ domain, reason, requestedMinutes })
  });
}

export function visibleAcknowledgementText(policy) {
  return [
    `I acknowledge FieldFlow monitoring policy version ${policy.policyVersion}.`,
    `I understand that tracking occurs only during an active work session.`,
    `Collected records may include session times, active and idle duration, input activity counts, device status, agent version${policy.collectApplicationNames ? ", and active application names" : ""}.`,
    `Typed characters, passwords, clipboard contents, screenshots, mouse coordinates, full browser URLs, page content, window titles, and full file paths are not collected. A managed extension may collect active website hostnames only.`,
    `Records are retained for ${policy.retentionDays} days.`
  ].join(" ");
}

export async function hashAcknowledgementText(text) {
  if (!globalThis.crypto?.subtle) {
    throw new ActivityApiError("CRYPTO_UNAVAILABLE", "Secure acknowledgement is unavailable in this browser.", 0);
  }
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
