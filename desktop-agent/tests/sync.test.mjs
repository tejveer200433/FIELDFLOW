import test from "node:test";
import assert from "node:assert/strict";
import { reconcileBatch } from "../src/lib/sync.js";

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
