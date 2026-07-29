import test from "node:test";
import assert from "node:assert/strict";
import { deriveAgentStatus, formatDuration } from "../src/lib/status.js";

test("status prioritizes offline and requires an explicit session", () => {
  assert.equal(deriveAgentStatus({ online: false, session: {} }), "Offline");
  assert.equal(deriveAgentStatus({ online: true, session: null }), "Not tracking");
});

test("status becomes idle only after the policy threshold", () => {
  assert.equal(deriveAgentStatus({ online: true, session: {}, idleSeconds: 299, idleThresholdSeconds: 300 }), "Tracking");
  assert.equal(deriveAgentStatus({ online: true, session: {}, idleSeconds: 300, idleThresholdSeconds: 300 }), "Idle");
});

test("duration is concise", () => {
  assert.equal(formatDuration(65), "1m");
  assert.equal(formatDuration(7320), "2h 2m");
});
