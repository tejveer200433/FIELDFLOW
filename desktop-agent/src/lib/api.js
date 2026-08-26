import { createSessionManager } from "./sessionManager.js";

export class ActivityApiError extends Error {
  constructor(message, code, status, retryAfterSeconds = null) {
    super(message);
    this.name = "ActivityApiError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function createActivityApi({ baseUrl, supabase, sessionManager, fetchImpl = fetch }) {
  const authentication = sessionManager || createSessionManager({ supabase });
  async function sessionToken({ forceRefresh = false, rejectedAccessToken = null } = {}) {
    try {
      const session = await authentication.getValidSession({ forceRefresh, rejectedAccessToken });
      return session.access_token;
    } catch (error) {
      throw new ActivityApiError(
        error?.message || "Your FieldFlow session could not be verified.",
        error?.retryable ? "AUTHENTICATION_DELAYED" : "AUTHENTICATION_REQUIRED",
        error?.retryable ? 0 : 401
      );
    }
  }

  async function request(path, options = {}) {
    let accessToken = await sessionToken();
    let retriedAuthentication = false;
    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      let response;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, {
          ...options,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            ...(options.headers || {})
          }
        });
      } catch (fetchError) {
        throw new ActivityApiError(
          fetchError.name === "AbortError"
            ? "The FieldFlow activity service timed out."
            : "The FieldFlow activity service is unavailable.",
          "NETWORK_ERROR",
          0
        );
      } finally {
        clearTimeout(timeout);
      }
      if (response.status === 401 && !retriedAuthentication) {
        retriedAuthentication = true;
        // A policy or audit endpoint can reject an otherwise current token. Do
        // not rotate the refresh token solely because of that response; the
        // session manager refreshes normally when the token is near expiry.
        accessToken = await sessionToken({ rejectedAccessToken: accessToken });
        continue;
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new ActivityApiError(
          payload?.error?.message || "The FieldFlow activity service is unavailable.",
          payload?.error?.code || "REQUEST_FAILED",
          response.status,
          response.status === 429 ? Number(response.headers.get("Retry-After")) || null : null
        );
      }
      return payload.data;
    }
  }

  return {
    getPolicy: () => request("/api/activity/policies"),
    getWebAccessPolicy: deviceId => request(`/api/activity/web-access/policy?deviceId=${encodeURIComponent(deviceId)}`),
    getDevices: () => request("/api/activity/devices?limit=100"),
    acknowledgePolicy: body => request("/api/activity/policies/acknowledge", {
      method: "POST", body: JSON.stringify(body)
    }),
    registerDevice: body => request("/api/activity/devices/register", {
      method: "POST", body: JSON.stringify(body)
    }),
    getCurrentSession: () => request("/api/activity/sessions/current"),
    startSession: body => request("/api/activity/sessions/start", {
      method: "POST", body: JSON.stringify(body)
    }),
    stopSession: body => request("/api/activity/sessions/stop", {
      method: "POST", body: JSON.stringify(body)
    }),
    ingest: body => request("/api/activity/ingest", {
      method: "POST", body: JSON.stringify(body)
    }),
    ingestWebsites: body => request("/api/activity/websites/ingest", {
      method: "POST", body: JSON.stringify(body)
    }),
    ingestCoding: body => request("/api/activity/coding/ingest", {
      method: "POST", body: JSON.stringify(body)
    }),
    registerScreenshot: body => request("/api/activity/screenshots/register", {
      method: "POST", body: JSON.stringify(body)
    }),
    uploadScreenshot: async ({ storagePath, bytes }) => {
      const { error } = await supabase.storage
        .from("activity-screenshots")
        .upload(storagePath, bytes, { contentType: "image/jpeg", upsert: false });
      if (error) {
        throw new ActivityApiError(error.message || "The screenshot upload failed.", "STORAGE_UPLOAD_FAILED", 0);
      }
    },
    heartbeat: body => request("/api/activity/heartbeat", {
      method: "POST", body: JSON.stringify(body)
    }),
    reportExtensionHealth: body => request("/api/activity/web-access/extension-health", {
      method: "POST", body: JSON.stringify(body)
    }),
    recordWebAccessEvent: body => request("/api/activity/web-access/events", {
      method: "POST", body: JSON.stringify(body)
    })
  };
}
