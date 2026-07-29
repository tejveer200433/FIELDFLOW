import test from "node:test";
import assert from "node:assert/strict";
import { ActivityApiError, createActivityApi } from "../src/lib/api.js";

function supabaseWith(session, refreshed = session) {
  return {
    auth: {
      getSession: async () => ({ data: { session } }),
      refreshSession: async () => ({ data: { session: refreshed } })
    }
  };
}

test("API adds a refreshed bearer token without exposing it in an error", async () => {
  const oldSession = { access_token: "expired-secret", expires_at: 1 };
  const newSession = { access_token: "fresh-secret", expires_at: 4_000_000_000 };
  let authorization;
  const api = createActivityApi({
    baseUrl: "http://localhost:3000",
    supabase: supabaseWith(oldSession, newSession),
    fetchImpl: async (_url, options) => {
      authorization = options.headers.Authorization;
      return new Response(JSON.stringify({ success: true, data: { trackingEnabled: true } }), { status: 200 });
    }
  });
  await api.getPolicy();
  assert.equal(authorization, "Bearer fresh-secret");
});

test("rate-limit response remains a safe retryable API error", async () => {
  const api = createActivityApi({
    baseUrl: "http://localhost:3000",
    supabase: supabaseWith({ access_token: "secret", expires_at: 4_000_000_000 }),
    fetchImpl: async () => new Response(JSON.stringify({
      success: false,
      error: { code: "RATE_LIMITED", message: "Try again later." }
    }), { status: 429, headers: { "Retry-After": "60" } })
  });
  await assert.rejects(api.getPolicy(), error => {
    assert.ok(error instanceof ActivityApiError);
    assert.equal(error.status, 429);
    assert.equal(error.code, "RATE_LIMITED");
    assert.equal(error.retryAfterSeconds, 60);
    assert.equal(error.message.includes("secret"), false);
    return true;
  });
});
