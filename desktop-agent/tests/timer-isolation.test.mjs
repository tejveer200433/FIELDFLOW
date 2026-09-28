import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("web access policy refreshes cannot reset core sync timers", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const coreTimerEffect = source.match(
    /useEffect\(\(\) => \{\s*clearTimers\(\);[\s\S]*?return clearTimers;\s*\}, \[([^\]]+)]\);/
  );

  assert.ok(coreTimerEffect, "core timer effect should remain identifiable");
  assert.doesNotMatch(coreTimerEffect[1], /webAccessPolicy/);
  assert.doesNotMatch(source, /setInterval\(refreshWebAccessPolicy, 10000\)/);
  assert.match(source, /heartbeatResult\?\.monitoringPolicy/);
  assert.match(source, /const applicationTimer = window\.setInterval\(enforceApplications, 2000\);/);
  assert.match(source, /\}, \[account, api, deviceId, webAccessPolicy\]\);/);
});

test("monitoring policy heartbeats cannot postpone the upload timer", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  assert.match(source, /setPolicy\(current => isSameMonitoringPolicy\(current, currentPolicy\) \? current : currentPolicy\)/);
  assert.match(source, /const syncTimer = window\.setInterval\([\s\S]*?performSync[\s\S]*?uploadIntervalSeconds/);
  assert.match(source, /\[account, deviceId, performSync, uploadIntervalSeconds\]/);
});
