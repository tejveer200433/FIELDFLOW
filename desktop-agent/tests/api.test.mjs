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

test("device status is loaded from the authenticated FIELD-FLOW device endpoint", async () => {
  let requestedUrl;
  const api = createActivityApi({
    baseUrl: "http://localhost:3000",
    supabase: supabaseWith({ access_token: "secret", expires_at: 4_000_000_000 }),
    fetchImpl: async url => {
      requestedUrl = url;
      return new Response(JSON.stringify({
        success: true,
        data: { devices: [{ deviceId: "device-1", status: "pending" }] }
      }), { status: 200 });
    }
  });
  const result = await api.getDevices();
  assert.equal(requestedUrl, "http://localhost:3000/api/activity/devices?limit=100");
  assert.equal(result.devices[0].status, "pending");
});

test("effective web access policy is refreshed independently for the registered device", async () => {
  let requestedUrl;
  const api = createActivityApi({
    baseUrl: "https://fieldflow.example",
    supabase: supabaseWith({ access_token: "secret", expires_at: 4_000_000_000 }),
    fetchImpl: async url => {
      requestedUrl = url;
      return new Response(JSON.stringify({ success: true, data: { ruleId: "rule-1", activeOverrides: [] } }), { status: 200 });
    }
  });
  await api.getWebAccessPolicy("device id/1");
  assert.equal(requestedUrl, "https://fieldflow.example/api/activity/web-access/policy?deviceId=device%20id%2F1");
});

test("API refreshes and retries once when the server rejects an expired token", async () => {
  const oldSession = { access_token: "stale-secret", expires_at: 4_000_000_000 };
  const newSession = { access_token: "fresh-secret", expires_at: 4_000_000_000 };
  const authorizations = [];
  let refreshCount = 0;
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: oldSession } }),
      refreshSession: async () => {
        refreshCount += 1;
        return { data: { session: newSession } };
      }
    }
  };
  const api = createActivityApi({
    baseUrl: "https://fieldflow.example",
    supabase,
    fetchImpl: async (_url, options) => {
      authorizations.push(options.headers.Authorization);
      if (authorizations.length === 1) {
        return new Response(JSON.stringify({
          success: false,
          error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication required." }
        }), { status: 401 });
      }
      return new Response(JSON.stringify({
        success: true,
        data: { acceptedCount: 1, rejected: [] }
      }), { status: 200 });
    }
  });

  const result = await api.ingest({
    deviceId: "device",
    trackingSessionId: "session",
    samples: [{ localSampleId: "sample" }]
  });

  assert.equal(result.acceptedCount, 1);
  assert.equal(refreshCount, 1);
  assert.deepEqual(authorizations, ["Bearer stale-secret", "Bearer fresh-secret"]);
});

test("API delays and retains the login when a rejected token cannot be refreshed", async () => {
  const api = createActivityApi({
    baseUrl: "https://fieldflow.example",
    supabase: supabaseWith(
      { access_token: "stale-secret", expires_at: 4_000_000_000 },
      null
    ),
    fetchImpl: async () => new Response(JSON.stringify({
      success: false,
      error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication required." }
    }), { status: 401 })
  });

  await assert.rejects(
    api.getPolicy(),
    error => {
      assert.equal(error.code, "AUTHENTICATION_DELAYED");
      assert.equal(error.status, 0);
      assert.equal(error.message, "FieldFlow could not rotate the saved session yet. The login has been retained and recovery will retry automatically.");
      assert.equal(error.message.includes("stale-secret"), false);
      return true;
    }
  );
});
