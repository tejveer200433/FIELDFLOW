import test from "node:test";
import assert from "node:assert/strict";
import { deriveActivityStatus } from "../../src/lib/activity/status.mjs";

const now = Date.parse("2026-07-28T12:00:00.000Z");
const session = { status: "active", ended_at: null };

test("no active session is not_tracking", () => {
  assert.equal(deriveActivityStatus({ session: null, heartbeat: null, now }), "not_tracking");
});

test("active session without heartbeat is offline", () => {
  assert.equal(deriveActivityStatus({ session, heartbeat: null, now }), "offline");
});

test("recent online and idle heartbeats map to stable statuses", () => {
  assert.equal(deriveActivityStatus({
    session, heartbeat: { recorded_at: "2026-07-28T11:59:30.000Z", online_status: "online" }, now
  }), "active");
  assert.equal(deriveActivityStatus({
    session, heartbeat: { recorded_at: "2026-07-28T11:59:30.000Z", online_status: "idle" }, now
  }), "idle");
});

test("stale heartbeat is offline", () => {
  assert.equal(deriveActivityStatus({
    session,
    heartbeat: { recorded_at: "2026-07-28T11:40:00.000Z", online_status: "online" },
    idleThresholdSeconds: 300,
    now
  }), "offline");
});
