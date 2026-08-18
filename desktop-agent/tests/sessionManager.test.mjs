import test from "node:test";
import assert from "node:assert/strict";
import { AgentSessionError, createSessionManager } from "../src/lib/sessionManager.js";

function client({ session, refresh }) {
  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      refreshSession: refresh
    }
  };
}

test("concurrent callers share exactly one rotating refresh token exchange", async () => {
  const expired = { access_token: "old", refresh_token: "rotation-secret", expires_at: 1 };
  const fresh = { access_token: "new", refresh_token: "next-secret", expires_at: 4_000_000_000 };
  let refreshes = 0;
  const manager = createSessionManager({
    supabase: client({
      session: expired,
      refresh: async () => {
        refreshes += 1;
        await new Promise(resolve => setTimeout(resolve, 20));
        return { data: { session: fresh }, error: null };
      }
    })
  });

  const sessions = await Promise.all(Array.from({ length: 12 }, () => manager.getValidSession()));

  assert.equal(refreshes, 1);
  assert.ok(sessions.every(session => session.access_token === "new"));
});

test("a forced API retry joins a refresh already started by system recovery", async () => {
  const current = { access_token: "current", refresh_token: "rotation-secret", expires_at: 4_000_000_000 };
  let refreshes = 0;
  const manager = createSessionManager({
    supabase: client({
      session: current,
      refresh: async () => {
        refreshes += 1;
        await new Promise(resolve => setTimeout(resolve, 20));
        return { data: { session: { ...current, access_token: "refreshed" } }, error: null };
      }
    })
  });

  const [recovery, apiRetry] = await Promise.all([
    manager.getValidSession({ forceRefresh: true }),
    manager.getValidSession({ forceRefresh: true })
  ]);

  assert.equal(refreshes, 1);
  assert.equal(recovery.access_token, "refreshed");
  assert.equal(apiRetry.access_token, "refreshed");
});

test("a late 401 retry reuses a token that another request already rotated", async () => {
  let current = { access_token: "rejected-token", refresh_token: "first", expires_at: 4_000_000_000 };
  let refreshes = 0;
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: current }, error: null }),
      refreshSession: async () => {
        refreshes += 1;
        current = { access_token: "rotated-token", refresh_token: "second", expires_at: 4_000_000_000 };
        return { data: { session: current }, error: null };
      }
    }
  };
  const manager = createSessionManager({ supabase });

  await manager.getValidSession({ forceRefresh: true, rejectedAccessToken: "rejected-token" });
  const lateRetry = await manager.getValidSession({ forceRefresh: true, rejectedAccessToken: "rejected-token" });

  assert.equal(refreshes, 1);
  assert.equal(lateRetry.access_token, "rotated-token");
});

test("temporary auth network failure is retryable and never calls local sign-out", async () => {
  let signOuts = 0;
  const events = [];
  const supabase = client({
    session: { access_token: "old", refresh_token: "saved", expires_at: 1 },
    refresh: async () => ({
      data: { session: null },
      error: Object.assign(new Error("network unavailable"), { name: "AuthRetryableFetchError", status: 0 })
    })
  });
  supabase.auth.signOut = async () => { signOuts += 1; };
  const manager = createSessionManager({ supabase, onEvent: event => events.push(event) });

  await assert.rejects(manager.getValidSession(), error => {
    assert.ok(error instanceof AgentSessionError);
    assert.equal(error.code, "AUTH_REFRESH_RETRYABLE");
    assert.equal(error.retryable, true);
    return true;
  });
  assert.equal(signOuts, 0);
  assert.ok(events.includes("auth_refresh_network_delayed"));
});

test("a rejected refresh retains the login and becomes retryable without exposing token values", async () => {
  const events = [];
  const manager = createSessionManager({
    supabase: client({
      session: { access_token: "access-secret", refresh_token: "refresh-secret", expires_at: 1 },
      refresh: async () => ({
        data: { session: null },
        error: Object.assign(new Error("Invalid Refresh Token"), { status: 400 })
      })
    }),
    onEvent: event => events.push(event)
  });

  await assert.rejects(manager.getValidSession(), error => {
    assert.equal(error.code, "AUTH_REFRESH_REJECTED_RETAINED");
    assert.equal(error.retryable, true);
    assert.equal(error.message.includes("access-secret"), false);
    assert.equal(error.message.includes("refresh-secret"), false);
    return true;
  });
  assert.ok(events.includes("auth_refresh_rejected_retained"));
});

test("a long-suspend refresh rejection is retried and recovers without another sign-in", async () => {
  let current = { access_token: "expired-access", refresh_token: "saved-refresh", expires_at: 1 };
  let refreshes = 0;
  const events = [];
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: current }, error: null }),
      refreshSession: async () => {
        refreshes += 1;
        if (refreshes === 1) {
          return {
            data: { session: null },
            error: Object.assign(new Error("Invalid Refresh Token"), { status: 400 })
          };
        }
        current = { access_token: "recovered-access", refresh_token: "rotated-refresh", expires_at: 4_000_000_000 };
        return { data: { session: current }, error: null };
      }
    }
  };
  const manager = createSessionManager({ supabase, onEvent: event => events.push(event) });

  await assert.rejects(manager.getValidSession(), error => error.code === "AUTH_REFRESH_REJECTED_RETAINED");
  const recovered = await manager.getValidSession();

  assert.equal(recovered.access_token, "recovered-access");
  assert.equal(refreshes, 2);
  assert.ok(events.includes("auth_refresh_rejected_retained"));
  assert.ok(events.includes("auth_refresh_succeeded"));
});

test("a valid session is reused without an unnecessary refresh", async () => {
  let refreshes = 0;
  const session = { access_token: "valid", refresh_token: "saved", expires_at: 4_000_000_000 };
  const manager = createSessionManager({
    supabase: client({
      session,
      refresh: async () => { refreshes += 1; return { data: { session }, error: null }; }
    })
  });

  assert.equal(await manager.getValidSession(), session);
  assert.equal(refreshes, 0);
});
