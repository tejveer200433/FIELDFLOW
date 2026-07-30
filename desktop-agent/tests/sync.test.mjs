import test from "node:test";
import assert from "node:assert/strict";
import { reconcileBatch, syncPendingSamples } from "../src/lib/sync.js";

test("accepted and duplicate samples are confirmed while rejected samples remain queued", () => {
  const samples = [
    { localSampleId: "one" },
    { localSampleId: "two" },
    { localSampleId: "three" }
  ];
  const result = reconcileBatch(samples, {
    acceptedCount: 1,
    duplicateCount: 1,
    rejected: [{ localSampleId: "two", reason: "OFFLINE_SYNC_EXPIRED" }]
  });
  assert.deepEqual(result.confirmedIds, ["one", "three"]);
  assert.deepEqual(result.failed, [{ id: "two", error: "OFFLINE_SYNC_EXPIRED" }]);
});

test("sync requests only samples belonging to the original tracking session", async () => {
  const calls = [];
  const invoke = async (command, payload) => {
    calls.push({ command, payload });
    if (command === "pending_samples") return [];
    throw new Error(`Unexpected command: ${command}`);
  };
  await syncPendingSamples({}, "device-1", "session-original", invoke);
  assert.deepEqual(calls, [{
    command: "pending_samples",
    payload: { trackingSessionId: "session-original", limit: 100 }
  }]);
});
