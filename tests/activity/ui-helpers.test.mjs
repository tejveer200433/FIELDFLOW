import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function importSource(path) {
  const source = readFileSync(join(process.cwd(), path), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

test("activity durations and intervals are human readable", async () => {
  const { formatDuration, formatInterval, formatPercentage } = await importSource("src/lib/activity/formatters.js");
  assert.equal(formatDuration(7 * 3600 + 18 * 60), "7h 18m");
  assert.equal(formatDuration(42 * 60), "42m");
  assert.equal(formatDuration(0), "0m");
  assert.equal(formatInterval(300), "5 minutes");
  assert.equal(formatInterval(30), "30 seconds");
  assert.equal(formatPercentage(72.4), "72%");
});

test("stale heartbeat is offline and recent heartbeat allows active status", async () => {
  const { deriveMonitoringStatus, isHeartbeatStale } = await importSource("src/lib/activity/status.js");
  const now = Date.parse("2026-07-28T12:00:00.000Z");
  assert.equal(isHeartbeatStale("2026-07-28T11:55:00.000Z", 60, now), true);
  const base = {
    policy: {
      trackingEnabled: true,
      requireAcknowledgement: false,
      heartbeatIntervalSeconds: 60
    },
    sessionInfo: { active: true },
    devices: [{ status: "active" }]
  };
  assert.equal(deriveMonitoringStatus({
    ...base,
    heartbeat: { recordedAt: "2026-07-28T11:59:30.000Z" },
    now
  }).key, "active");
  assert.equal(deriveMonitoringStatus({
    ...base,
    heartbeat: { recordedAt: "2026-07-28T11:55:00.000Z" },
    now
  }).key, "offline");
  assert.equal(deriveMonitoringStatus({
    ...base,
    heartbeat: { recordedAt: "2026-07-28T11:59:30.000Z", onlineStatus: "offline" },
    now
  }).key, "offline");
});

test("acknowledgement state blocks readiness", async () => {
  const { deriveMonitoringStatus } = await importSource("src/lib/activity/status.js");
  assert.equal(deriveMonitoringStatus({
    policy: {
      trackingEnabled: true,
      requireAcknowledgement: true,
      acknowledgementStatus: { acknowledged: false }
    },
    sessionInfo: { active: false },
    devices: [{ status: "active" }]
  }).key, "acknowledgement");
});
