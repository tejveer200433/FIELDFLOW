"use client";

import { authenticatedFetch } from "@/frontend/lib/apiClient";
import { ActivityApiError } from "@/frontend/features/activity/api/client";

async function request(path, init = {}) {
  const response = await authenticatedFetch(`/api/activity/web-access${path}`, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new ActivityApiError(payload.error?.code, payload.error?.message || `Web access request failed (${response.status}).`, response.status);
  return payload;
}

export const getWebAccessRequests = () => request("/requests").then(payload => payload.data);
export const createWebAccessRequest = body => request("/requests", { method: "POST", body: JSON.stringify(body) });
export const reviewWebAccessRequest = body => request("/requests", { method: "PATCH", body: JSON.stringify(body) });
export const getWebAccessRules = () => request("/rules").then(payload => payload.data);
export const createWebAccessRule = body => request("/rules", { method: "POST", body: JSON.stringify(body) });
export const updateWebAccessRule = body => request("/rules", { method: "PATCH", body: JSON.stringify(body) });
export const deleteWebAccessRule = id => request(`/rules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
export const getExtensionHealth = () => request("/extension-health").then(payload => payload.data.statuses);
export const reportExtensionHealth = body => request("/extension-health", { method: "POST", body: JSON.stringify(body) });
export const getWebAccessEvents = () => request("/events").then(payload => payload.data.events);
export const recordWebAccessEvent = body => request("/events", { method: "POST", body: JSON.stringify(body) });
