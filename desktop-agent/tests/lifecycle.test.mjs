import test from "node:test";
import assert from "node:assert/strict";
import { decideStartupTracking, policyAllowsAutomaticTracking, reconcileTrackingSession } from "../src/lib/lifecycle.js";

const enabledPolicy = {
  trackingEnabled: true,
  requireAcknowledgement: true,
  acknowledgementStatus: { acknowledged: true }
};

test("automatic tracking requires an enabled acknowledged policy", () => {
  assert.equal(policyAllowsAutomaticTracking(enabledPolicy), true);
  assert.equal(policyAllowsAutomaticTracking({ ...enabledPolicy, trackingEnabled: false }), false);
  assert.equal(policyAllowsAutomaticTracking({ ...enabledPolicy, acknowledgementStatus: null }), false);
});

test("startup resumes this device, starts without a session, and never steals another device session", () => {
  assert.equal(decideStartupTracking({
    policy: enabledPolicy,
    deviceStatus: "active",
    deviceId: "device-a",
    currentSession: { active: true, session: { deviceId: "device-a" } }
  }), "resume");
  assert.equal(decideStartupTracking({
    policy: enabledPolicy,
    deviceStatus: "active",
    deviceId: "device-a",
    currentSession: { active: false, session: null }
  }), "start");
  assert.equal(decideStartupTracking({
    policy: enabledPolicy,
    deviceStatus: "active",
    deviceId: "device-a",
    currentSession: { active: true, session: { deviceId: "device-b" } }
  }), "other-device");
});

test("server reconciliation stops stale local tracking and adopts a valid server session", () => {
  assert.deepEqual(reconcileTrackingSession({
    localSession: { sessionId: "old" },
    currentSession: { active: false, session: null },
    deviceId: "device-a"
  }), { action: "stop", session: null });
  assert.deepEqual(reconcileTrackingSession({
    localSession: null,
    currentSession: { active: true, session: { sessionId: "new", deviceId: "device-a" } },
    deviceId: "device-a"
  }), { action: "resume", session: { sessionId: "new", deviceId: "device-a" } });
});

test("reconciliation auto-restarts tracking once a server-closed session has no local or server session left", () => {
  assert.deepEqual(reconcileTrackingSession({
    localSession: null,
    currentSession: { active: false, session: null },
    deviceId: "device-a",
    policy: enabledPolicy,
    deviceStatus: "active"
  }), { action: "start", session: null });
});

test("reconciliation never auto-restarts without an enabled/acknowledged policy or an active device", () => {
  assert.deepEqual(reconcileTrackingSession({
    localSession: null,
    currentSession: { active: false, session: null },
    deviceId: "device-a"
  }), { action: "keep", session: null });
  assert.deepEqual(reconcileTrackingSession({
    localSession: null,
    currentSession: { active: false, session: null },
    deviceId: "device-a",
    policy: { ...enabledPolicy, trackingEnabled: false },
    deviceStatus: "active"
  }), { action: "keep", session: null });
  assert.deepEqual(reconcileTrackingSession({
    localSession: null,
    currentSession: { active: false, session: null },
    deviceId: "device-a",
    policy: enabledPolicy,
    deviceStatus: "pending"
  }), { action: "keep", session: null });
});

test("reconciliation never steals another device's active session", () => {
  assert.deepEqual(reconcileTrackingSession({
    localSession: null,
    currentSession: { active: true, session: { sessionId: "new", deviceId: "device-b" } },
    deviceId: "device-a",
    policy: enabledPolicy,
    deviceStatus: "active"
  }), { action: "keep", session: null });
});
