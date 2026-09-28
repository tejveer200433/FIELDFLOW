import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseScreenshotRequest } from "../../src/backend/activity/validation.mjs";

const deviceId = "33333333-3333-4333-8333-333333333333";
test("screenshot requests reject impersonation, malformed IDs and unknown commands", () => {
  assert.deepEqual(parseScreenshotRequest({ deviceId }), { deviceId });
  for (const input of [{ deviceId: "bad" }, { deviceId, employeeId: deviceId }, { deviceId, force: true }, { deviceId, consent: true }]) {
    assert.throws(() => parseScreenshotRequest(input));
  }
});

async function routeHarness({ inScope = true, permission = true, error = null, expired = false } = {}) {
  const source = (await readFile(new URL("../../src/app/api/activity/screenshots/requests/route.js", import.meta.url), "utf8"))
    .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
  const calls = [];
  const row = { id: deviceId, device_id: deviceId, employee_id: "employee", status: "pending", expires_at: new Date(Date.now() + (expired ? -1000 : 300000)).toISOString() };
  const client = {
    from: table => {
      const query = { select: () => query, eq: () => query, order: () => query, limit: () => query,
        maybeSingle: async () => ({ data: table === "employee_devices" ? { id: deviceId, employee_id: "employee" } : row, error: null }) };
      return query;
    },
    rpc: async (name, args) => { calls.push({ name, args }); return { data: row, error }; }
  };
  class ActivityError extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status; } }
  const deps = {
    parseScreenshotRequest, ActivityError, ACTIVITY_PERMISSIONS: { managePolicies: "manage" },
    requireActivitySession: async (_request, permissions) => { assert.deepEqual(permissions, ["manage"]); if (!permission) throw new ActivityError("ACCESS_DENIED", "Denied", 403); return { client }; },
    resolveActivityScope: async (_session, options) => { assert.equal(options.allowSelf, false); return {}; },
    assertActivityEmployee: () => { if (!inScope) throw new ActivityError("ACCESS_DENIED", "Out of scope", 403); },
    enforceActivityRateLimit: async () => {}, rpcRow: value => value,
    readActivityJson: request => request.json(),
    throwActivityDatabaseError: error => { throw new ActivityError("DATABASE_MIGRATION_REQUIRED", error.message, 503); },
    activitySuccess: (data, options = {}) => Response.json({ success: true, data }, { status: options.status || 200 }),
    activityFailure: error => Response.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.status || 400 })
  };
  return { calls, ...new Function(...Object.keys(deps), `${source}\nreturn {GET, POST};`)(...Object.values(deps)) };
}
const request = () => new Request("https://example.test/api/activity/screenshots/requests", { method: "POST", body: JSON.stringify({ deviceId }) });
test("only an administrator within employee scope reaches the request RPC", async () => {
  for (const options of [{ permission: false }, { inScope: false }]) {
    const route = await routeHarness(options);
    assert.equal((await route.POST(request())).status, 403); assert.equal(route.calls.length, 0);
  }
  const route = await routeHarness();
  assert.equal((await route.POST(request())).status, 201);
  assert.deepEqual(route.calls, [{ name: "activity_request_screenshot", args: { p_device_id: deviceId } }]);
});
test("disabled tracking is an actionable conflict and absent RPC needs migration", async () => {
  let route = await routeHarness({ error: { message: "Screenshot request disabled by policy" } });
  assert.equal((await route.POST(request())).status, 409);
  route = await routeHarness({ error: { code: "PGRST202", message: "RPC missing" } });
  assert.equal((await route.POST(request())).status, 503);
});
test("a stale pending request is shown as expired without mutating the database", async () => {
  const route = await routeHarness({ expired: true });
  const response = await route.GET(new Request(`https://example.test/api/activity/screenshots/requests?deviceId=${deviceId}`));
  assert.equal((await response.json()).data.status, "expired"); assert.equal(route.calls.length, 0);
});
