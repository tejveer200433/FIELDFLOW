import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = path => readFileSync(join(root, path), "utf8");
const page = read("src/frontend/features/activity/components/MonitoringSettingsPage.js");
const pulse = read("src/frontend/features/activity/components/MonitoringSystemPulse.js");
const css = read("src/app/globals.css");

test("monitoring overview is data-backed and preserves the existing operational paths", () => {
  for (const label of ["Workforce health at a glance", "Needs your attention", "Device health", "Workforce pulse", "Activity controls"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /getWebAccessRequests\(\)/);
  assert.match(page, /getExtensionHealth\(\)/);
  assert.match(page, /getWebAccessEvents\(\)/);
  assert.match(page, /onOpenDevices\("pending"\)/);
  assert.match(page, /onOpenAlerts/);
  assert.match(page, /You're all caught up/);
  assert.match(page, /not a productivity score/);
  assert.doesNotMatch(page, /SpeechSynthesis|speechSynthesis|AudioContext/);
});

test("system pulse is lightweight, pointer-throttled, and respects reduced motion", () => {
  assert.match(pulse, /requestAnimationFrame/);
  assert.match(pulse, /cancelAnimationFrame/);
  assert.match(pulse, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(pulse, /three|webgl|canvas/i);
  assert.match(css, /\.monitoring-pulse/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
