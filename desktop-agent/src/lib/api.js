export class ActivityApiError extends Error {
  constructor(message, code, status, retryAfterSeconds = null) {
    super(message);
    this.name = "ActivityApiError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function createActivityApi({ baseUrl, supabase, fetchImpl = fetch }) {
  async function request(path, options = {}) {
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new ActivityApiError("Sign in to continue.", "AUTHENTICATION_REQUIRED", 401);
    if (session.expires_at && session.expires_at * 1000 - Date.now() < 60_000) {
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.data.session;
    }
    if (!session?.access_token) {
      throw new ActivityApiError("Your secure session could not be refreshed.", "AUTHENTICATION_REQUIRED", 401);
    }

    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
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

  return {
    getPolicy: () => request("/api/activity/policies"),
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
    heartbeat: body => request("/api/activity/heartbeat", {
      method: "POST", body: JSON.stringify(body)
    })
  };
}
