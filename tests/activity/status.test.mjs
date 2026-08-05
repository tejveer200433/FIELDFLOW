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

test("no session but a device that hasn't checked in recently is unreachable", () => {
  assert.equal(deriveActivityStatus({
    session: null,
    heartbeat: null,
    device: { status: "active", last_seen_at: "2026-07-28T11:00:00.000Z" },
    now
  }), "unreachable");
});

test("no session with a recently-seen device is not_tracking, not unreachable", () => {
  assert.equal(deriveActivityStatus({
    session: null,
    heartbeat: null,
    device: { status: "active", last_seen_at: "2026-07-28T11:55:00.000Z" },
    now
  }), "not_tracking");
});

test("no session with a pending or revoked device is not_tracking regardless of staleness", () => {
  assert.equal(deriveActivityStatus({
    session: null,
    heartbeat: null,
    device: { status: "pending", last_seen_at: "2026-07-01T00:00:00.000Z" },
    now
  }), "not_tracking");
});
