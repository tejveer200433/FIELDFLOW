import test from "node:test";
import assert from "node:assert/strict";
import {
  ActivityValidationError,
  parseDeviceRegistration,
  parseDeviceUpdate,
  parseHeartbeat,
  parsePolicyAcknowledgement,
  parsePolicyAdministration,
  parseSampleBatch,
  parseScreenshotRegistration,
  parseScreenshotSignedUrlQuery,
  parseSessionStart,
  parseSessionStop,
  parseTeamFilters
} from "../../src/lib/activity/validation.mjs";

const deviceId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";

test("device registration accepts only the documented fields", () => {
  const value = parseDeviceRegistration({
    deviceName: "Field laptop",
    platform: "windows",
    operatingSystemVersion: "11",
    agentVersion: "1.0.0",
    deviceIdentifier: "local-device-value"
  });
  assert.equal(value.platform, "windows");
  assert.equal(value.deviceIdentifier, "local-device-value");
});

test("device registration rejects unsupported platforms", () => {
  assert.throws(() => parseDeviceRegistration({
    deviceName: "Field laptop", platform: "android", agentVersion: "1", deviceIdentifier: "identifier"
  }), ActivityValidationError);
});

test("sensitive identity and tracking fields are rejected", () => {
  for (const field of ["employeeId", "role", "typedText", "keyCodes", "clipboard", "screenshot", "mouseCoordinates", "accessToken"]) {
    assert.throws(() => parseDeviceRegistration({
      deviceName: "Field laptop", platform: "windows", agentVersion: "1",
      deviceIdentifier: "identifier", [field]: "forbidden"
    }), error => error.code === "FORBIDDEN_FIELD");
  }
});

test("device actions are constrained", () => {
  assert.deepEqual(parseDeviceUpdate({ action: "revoke" }), { action: "revoke", agentVersion: null });
  assert.throws(() => parseDeviceUpdate({ action: "transfer" }), ActivityValidationError);
});

test("session start and stop validate UUIDs and sources", () => {
  assert.equal(parseSessionStart({ deviceId }).source, "agent");
  assert.equal(parseSessionStop({ sessionId, source: "timeout" }).source, "timeout");
  assert.throws(() => parseSessionStart({ deviceId: "not-a-uuid" }), ActivityValidationError);
  assert.throws(() => parseSessionStop({ sessionId, source: "administrator" }), ActivityValidationError);
});

test("sample batches accept one to one hundred strict aggregate samples", () => {
  const result = parseSampleBatch({
    deviceId,
    trackingSessionId: sessionId,
    samples: [{
      localSampleId: "sample-1",
      capturedAt: "2026-07-28T10:00:00.000Z",
      keyboardEventCount: 2,
      mouseEventCount: 4,
      idleSeconds: 0,
      activeApplication: "FieldFlow",
      screenLocked: false
    }]
  });
  assert.equal(result.samples.length, 1);
  assert.equal(result.samples[0].keyboardEventCount, 2);
});

test("sample batches reject empty and oversized batches", () => {
  assert.throws(() => parseSampleBatch({ deviceId, trackingSessionId: sessionId, samples: [] }), error => error.code === "INVALID_BATCH_SIZE");
  assert.throws(() => parseSampleBatch({
    deviceId, trackingSessionId: sessionId,
    samples: Array.from({ length: 101 }, (_, index) => ({
      localSampleId: `sample-${index}`, capturedAt: "2026-07-28T10:00:00.000Z"
    }))
  }), error => error.code === "INVALID_BATCH_SIZE");
});

test("sample batches reject negative counters and invalid timestamps", () => {
  assert.throws(() => parseSampleBatch({
    deviceId, trackingSessionId: sessionId,
    samples: [{ localSampleId: "one", capturedAt: "not-a-date", keyboardEventCount: -1 }]
  }), ActivityValidationError);
  assert.throws(() => parseSampleBatch({
    deviceId, trackingSessionId: sessionId,
    samples: [{ localSampleId: "one", capturedAt: "2026-07-28T10:00:00+05:30" }]
  }), ActivityValidationError);
});

test("sample batches reject duplicate local identifiers and forbidden content", () => {
  const sample = { localSampleId: "same", capturedAt: "2026-07-28T10:00:00.000Z" };
  assert.throws(() => parseSampleBatch({ deviceId, trackingSessionId: sessionId, samples: [sample, sample] }), error => error.code === "DUPLICATE_BATCH_ID");
  assert.throws(() => parseSampleBatch({
    deviceId, trackingSessionId: sessionId,
    samples: [{ ...sample, keystrokes: ["a"] }]
  }), error => error.code === "FORBIDDEN_FIELD");
});

test("heartbeat validates state and battery", () => {
  assert.equal(parseHeartbeat({
    deviceId, trackingSessionId: null, agentVersion: "1.0.0", onlineStatus: "online", batteryLevel: 80
  }).batteryLevel, 80);
  assert.throws(() => parseHeartbeat({
    deviceId, agentVersion: "1", onlineStatus: "online", batteryLevel: 101
  }), ActivityValidationError);
  assert.throws(() => parseHeartbeat({
    deviceId, agentVersion: "1", onlineStatus: "busy", batteryLevel: 10
  }), ActivityValidationError);
});

test("policy acknowledgement requires a matching hash shape", () => {
  assert.equal(parsePolicyAcknowledgement({
    policyId: deviceId,
    policyVersion: 1,
    acknowledgementTextHash: "a".repeat(64)
  }).policyVersion, 1);
  assert.throws(() => parsePolicyAcknowledgement({
    policyId: deviceId, policyVersion: 1, acknowledgementTextHash: "raw text"
  }), ActivityValidationError);
});

test("policy administration applies safe defaults and bounds", () => {
  const policy = parsePolicyAdministration({ trackingEnabled: false });
  assert.equal(policy.sampleIntervalSeconds, 60);
  assert.equal(policy.trackingEnabled, false);
  assert.equal(policy.collectScreenshots, false);
  assert.equal(policy.screenshotIntervalSeconds, 240);
  assert.deepEqual(policy.screenshotExcludedApps, []);
  assert.throws(() => parsePolicyAdministration({ retentionDays: 10000 }), ActivityValidationError);
});

test("policy administration bounds the screenshot interval and exclude list", () => {
  assert.throws(() => parsePolicyAdministration({ screenshotIntervalSeconds: 30 }), ActivityValidationError);
  assert.throws(() => parsePolicyAdministration({ screenshotIntervalSeconds: 600 }), ActivityValidationError);
  const policy = parsePolicyAdministration({
    collectScreenshots: true,
    screenshotIntervalSeconds: 180,
    screenshotExcludedApps: [" 1Password ", "1password", "banking-app"]
  });
  assert.equal(policy.collectScreenshots, true);
  assert.equal(policy.screenshotIntervalSeconds, 180);
  assert.deepEqual(policy.screenshotExcludedApps, ["1password", "banking-app"]);
  assert.throws(() => parsePolicyAdministration({ screenshotExcludedApps: ["bad<name>"] }), ActivityValidationError);
});

test("screenshot registration requires a well-formed local sample id and bounded byte size", () => {
  const registration = parseScreenshotRegistration({
    trackingSessionId: sessionId,
    localSampleId: "shot-1",
    capturedAt: "2026-08-06T12:00:00Z",
    activeApplication: "Code",
    byteSize: 128000
  });
  assert.equal(registration.trackingSessionId, sessionId);
  assert.equal(registration.byteSize, 128000);
  assert.throws(
    () => parseScreenshotRegistration({
      trackingSessionId: sessionId, localSampleId: "bad id!", capturedAt: "2026-08-06T12:00:00Z", byteSize: 1
    }),
    ActivityValidationError
  );
  assert.throws(
    () => parseScreenshotRegistration({
      trackingSessionId: sessionId, localSampleId: "shot-1", capturedAt: "2026-08-06T12:00:00Z", byteSize: 9000000
    }),
    ActivityValidationError
  );
});

test("screenshot signed-url requests only accept the expected storage path shape", () => {
  const validPath = `${deviceId}/${sessionId}/20260806120000-${"a".repeat(32)}.jpg`;
  const parsed = parseScreenshotSignedUrlQuery(new URLSearchParams({ path: validPath }));
  assert.equal(parsed.path, validPath);
  assert.throws(
    () => parseScreenshotSignedUrlQuery(new URLSearchParams({ path: "../etc/passwd" })),
    ActivityValidationError
  );
});

test("team filters reject unknown query keys", () => {
  assert.throws(() => parseTeamFilters(new URLSearchParams("rawSamples=true")), error => error.code === "UNKNOWN_FIELD");
});
