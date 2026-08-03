import test from "node:test";
import assert from "node:assert/strict";
import {
  heartbeatMinimumGapMs,
  isHeartbeatRateLimit,
  shouldSendHeartbeat
} from "../src/lib/heartbeat.js";

test("heartbeat scheduling leaves a five-second safety gap", () => {
  assert.equal(heartbeatMinimumGapMs(60), 55_000);
  assert.equal(heartbeatMinimumGapMs(15), 10_000);
  assert.equal(heartbeatMinimumGapMs(2), 5_000);
  assert.equal(shouldSendHeartbeat({ lastAttemptAt: 10_000, now: 64_999, intervalSeconds: 60 }), false);
  assert.equal(shouldSendHeartbeat({ lastAttemptAt: 10_000, now: 65_000, intervalSeconds: 60 }), true);
});

test("only heartbeat rate limits are safe to suppress", () => {
  assert.equal(isHeartbeatRateLimit({ code: "HEARTBEAT_TOO_FREQUENT", status: 429 }), true);
  assert.equal(isHeartbeatRateLimit({ code: "RATE_LIMITED", status: 429 }), true);
  assert.equal(isHeartbeatRateLimit({ code: "AUTHENTICATION_REQUIRED", status: 401 }), false);
});
