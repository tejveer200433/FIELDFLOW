import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function importSource(path) {
  const source = readFileSync(join(process.cwd(), path), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

test("admin policy defaults match Phase 1 safe defaults", async () => {
  const { policyFormValues } = await importSource("src/lib/activity/adminValidation.js");
  assert.deepEqual(policyFormValues(null), {
    trackingEnabled: false,
    idleThresholdSeconds: 300,
    sampleIntervalSeconds: 60,
    uploadIntervalSeconds: 300,
    offlineSyncLimitSeconds: 86400,
    heartbeatIntervalSeconds: 60,
    collectApplicationNames: false,
    requireAcknowledgement: true,
    retentionDays: 90,
    websiteBlockingEnabled: false,
    blockedDomains: [],
    collectCodingProjectNames: false,
    collectScreenshots: false,
    screenshotIntervalSeconds: 240,
    screenshotExcludedApps: []
  });
});

test("policy interval and retention ranges match server validation", async () => {
  const { policyFormValues, validatePolicy } = await importSource("src/lib/activity/adminValidation.js");
  const valid = policyFormValues(null);
  assert.deepEqual(validatePolicy(valid), {});
  assert.ok(validatePolicy({ ...valid, sampleIntervalSeconds: 9 }).sampleIntervalSeconds);
  assert.ok(validatePolicy({ ...valid, heartbeatIntervalSeconds: 3601 }).heartbeatIntervalSeconds);
  assert.ok(validatePolicy({ ...valid, retentionDays: 0 }).retentionDays);
  assert.ok(validatePolicy({ ...valid, idleThresholdSeconds: 30.5 }).idleThresholdSeconds);
  assert.ok(validatePolicy({ ...valid, screenshotIntervalSeconds: 30 }).screenshotIntervalSeconds);
  assert.ok(validatePolicy({ ...valid, screenshotIntervalSeconds: 600 }).screenshotIntervalSeconds);
});

test("new versions report exact changed fields", async () => {
  const { policyChanges } = await importSource("src/lib/activity/adminValidation.js");
  const current = {
    trackingEnabled: false,
    idleThresholdSeconds: 300,
    sampleIntervalSeconds: 60,
    uploadIntervalSeconds: 300,
    offlineSyncLimitSeconds: 86400,
    heartbeatIntervalSeconds: 60,
    collectApplicationNames: false,
    requireAcknowledgement: true,
    retentionDays: 90,
    websiteBlockingEnabled: false,
    blockedDomains: [],
    collectCodingProjectNames: false,
    collectScreenshots: false,
    screenshotIntervalSeconds: 240,
    screenshotExcludedApps: []
  };
  const changes = policyChanges(current, { ...current, trackingEnabled: true, retentionDays: 60 });
  assert.deepEqual(changes.map(change => change.field), ["trackingEnabled", "retentionDays"]);
  const withScreenshots = policyChanges(current, {
    ...current, collectScreenshots: true, screenshotExcludedApps: ["1password"]
  });
  assert.deepEqual(withScreenshots.map(change => change.field), ["collectScreenshots", "screenshotExcludedApps"]);
});
