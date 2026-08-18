const REFRESH_LEEWAY_MS = 2 * 60 * 1000;

export class AgentSessionError extends Error {
  constructor(message, code, { retryable = false, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "AgentSessionError";
    this.code = code;
    this.retryable = retryable;
  }
}

function isRetryable(error) {
  const status = Number(error?.status) || 0;
  const name = String(error?.name || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return name.includes("retryable")
    || status === 0
    || status === 408
    || status === 429
    || status >= 500
    || /network|fetch|timeout|temporar|unavailable|connection|credential|secure.session|storage|locked/.test(message);
}

function sessionError(error, { retainRejected = false } = {}) {
  if (isRetryable(error)) {
    return new AgentSessionError(
      "FieldFlow authentication is temporarily unavailable. The saved session has been retained.",
      "AUTH_REFRESH_RETRYABLE",
      { retryable: true, cause: error }
    );
  }
  if (retainRejected) {
    return new AgentSessionError(
      "FieldFlow could not rotate the saved session yet. The login has been retained and recovery will retry automatically.",
      "AUTH_REFRESH_REJECTED_RETAINED",
      { retryable: true, cause: error }
    );
  }
  return new AgentSessionError(
    "Your saved FieldFlow session is no longer valid. Sign in again.",
    "AUTH_SESSION_REVOKED",
    { cause: error }
  );
}

export function createSessionManager({ supabase, onEvent = () => {}, now = () => Date.now() }) {
  let readInFlight = null;
  let refreshInFlight = null;
  let restoredReported = false;

  function report(event, level = "info") {
    Promise.resolve(onEvent(event, level)).catch(() => {});
  }

  async function readSession() {
    if (readInFlight) return readInFlight;
    const request = (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        const classified = sessionError(error, { retainRejected: true });
        report(classified.code === "AUTH_REFRESH_REJECTED_RETAINED" ? "auth_refresh_rejected_retained" : "auth_refresh_network_delayed", "warn");
        throw classified;
      }
      return data.session || null;
    })();
    readInFlight = request;
    try {
      return await request;
    } finally {
      if (readInFlight === request) readInFlight = null;
    }
  }

  async function refresh() {
    if (refreshInFlight) return refreshInFlight;
    report("auth_refresh_started");
    const request = (async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        const classified = sessionError(error, { retainRejected: true });
        report(classified.code === "AUTH_REFRESH_REJECTED_RETAINED" ? "auth_refresh_rejected_retained" : "auth_refresh_network_delayed", "warn");
        throw classified;
      }
      if (!data.session?.access_token) {
        report("auth_refresh_rejected_retained", "warn");
        throw new AgentSessionError(
          "FieldFlow could not rotate the saved session yet. The login has been retained and recovery will retry automatically.",
          "AUTH_REFRESH_REJECTED_RETAINED",
          { retryable: true }
        );
      }
      report("auth_refresh_succeeded");
      restoredReported = true;
      return data.session;
    })();
    refreshInFlight = request;
    try {
      return await request;
    } finally {
      if (refreshInFlight === request) refreshInFlight = null;
    }
  }

  async function getValidSession({ forceRefresh = false, rejectedAccessToken = null } = {}) {
    const session = await readSession();
    if (!session?.access_token) {
      report("auth_session_missing", "warn");
      throw new AgentSessionError("Sign in to continue.", "AUTH_SESSION_MISSING");
    }
    const expiresAt = Number(session.expires_at) * 1000;
    const alreadyRotated = forceRefresh
      && rejectedAccessToken
      && session.access_token !== rejectedAccessToken;
    if (!alreadyRotated && (forceRefresh || (Number.isFinite(expiresAt) && expiresAt - now() <= REFRESH_LEEWAY_MS))) {
      return refresh();
    }
    if (!restoredReported) {
      restoredReported = true;
      report("auth_session_restored");
    }
    return session;
  }

  return { getValidSession };
}
