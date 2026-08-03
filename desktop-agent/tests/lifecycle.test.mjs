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
