import test from "node:test";
import assert from "node:assert/strict";

import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_STARTUP_DELAY_MS,
  checkAndInstallAgentUpdate
} from "../src/lib/updater.js";

test("automatic update timing is bounded and not continuous", () => {
  assert.equal(UPDATE_STARTUP_DELAY_MS, 30_000);
  assert.equal(UPDATE_CHECK_INTERVAL_MS, 21_600_000);
});

test("an available update flushes state before installation and restart", async () => {
  const events = [];
  const result = await checkAndInstallAgentUpdate({
    checkImpl: async options => {
      assert.equal(options.timeout, 30_000);
      return {
        version: "0.4.0",
        downloadAndInstall: async () => events.push("installed")
      };
    },
    beforeInstall: async () => events.push("flushed"),
    relaunchImpl: async () => events.push("restarted"),
    onStatus: status => events.push(status)
  });
  assert.deepEqual(result, { installed: true, version: "0.4.0" });
  assert.deepEqual(events, [
    "Checking for updates",
    "Preparing update 0.4.0",
    "flushed",
    "Installing update 0.4.0",
    "installed",
    "Restarting after update",
    "restarted"
  ]);
});

test("no release leaves the running agent untouched", async () => {
  const statuses = [];
  const result = await checkAndInstallAgentUpdate({
    checkImpl: async () => null,
    relaunchImpl: async () => assert.fail("must not restart"),
    onStatus: status => statuses.push(status)
  });
  assert.deepEqual(result, { installed: false, version: null });
  assert.deepEqual(statuses, ["Checking for updates", "Up to date"]);
});
