import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { browserNameFromUserAgent } from "../../browser-extension/browser-detection.mjs";

const root = process.cwd();
const read = path => readFileSync(join(root, path), "utf8");

test("the shared extension identifies supported browser families", () => {
  assert.equal(browserNameFromUserAgent("Mozilla Chrome/130.0 Safari/537.36 Edg/130.0"), "edge");
  assert.equal(browserNameFromUserAgent("Mozilla Chrome/130.0 Safari/537.36 OPR/116.0"), "opera");
  assert.equal(browserNameFromUserAgent("Mozilla Firefox/128.0"), "firefox");
  assert.equal(browserNameFromUserAgent("Mozilla Chrome/130.0 Safari/537.36"), "chrome");
});

test("the extension supports Chromium and Firefox background environments", () => {
  const manifest = JSON.parse(read("browser-extension/manifest.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, "background.js");
  assert.deepEqual(manifest.background.scripts, ["background.js"]);
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, "121.0");
});

test("website collection is automatic and contains no separate authentication", () => {
  const background = read("browser-extension/background.js");
  const config = read("browser-extension/config.js");
  const popup = read("browser-extension/popup.html");
  assert.match(background, /extensionApi\.alarms\.onAlarm/);
  assert.match(background, /extensionApi\.tabs\.onActivated/);
  assert.match(background, /extensionApi\.tabs\.onUpdated/);
  assert.match(background, /extensionApi\.windows\.onFocusChanged/);
  assert.match(background, /globalThis\.browser \?\? globalThis\.chrome/);
  assert.doesNotMatch(popup, /check-now|Check active website/i);
  assert.doesNotMatch(`${background}\n${config}\n${popup}`, /password|supabaseAnonKey|accessToken|refreshToken/);
  assert.deepEqual(JSON.parse(read("browser-extension/manifest.json")).host_permissions, [
    "http://127.0.0.1:38473/*"
  ]);
});
