import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chromiumManifestUrl = new URL("../../browser-extension/store/manifest.chromium.json", import.meta.url);
const firefoxManifestUrl = new URL("../../browser-extension/store/manifest.firefox.json", import.meta.url);

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

function checkSharedManifest(manifest) {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["alarms", "storage", "tabs"]);
  assert.deepEqual(manifest.host_permissions, ["http://127.0.0.1:38473/*"]);
  assert.equal(manifest.incognito, "not_allowed");
  assert.deepEqual(Object.keys(manifest.icons).sort(), ["16", "32", "48", "128"].sort());
}

test("Chromium store manifest uses only a Manifest V3 service worker", async () => {
  const manifest = await readJson(chromiumManifestUrl);
  checkSharedManifest(manifest);
  assert.equal(manifest.background.service_worker, "background.js");
  assert.equal(manifest.background.type, "module");
  assert.equal("scripts" in manifest.background, false);
  assert.equal("browser_specific_settings" in manifest, false);
});

test("Firefox store manifest declares website activity collection", async () => {
  const manifest = await readJson(firefoxManifestUrl);
  checkSharedManifest(manifest);
  assert.deepEqual(manifest.background.scripts, ["background.js"]);
  assert.equal("service_worker" in manifest.background, false);
  assert.deepEqual(
    manifest.browser_specific_settings.gecko.data_collection_permissions.required,
    ["websiteActivity"]
  );
});

test("extension source sends domain-only data and contains no service credentials", async () => {
  const background = await readFile(new URL("../../browser-extension/background.js", import.meta.url), "utf8");
  assert.match(background, /body: JSON\.stringify\(\{ domain, browserName: detectedBrowserName, durationSeconds \}\)/);
  assert.doesNotMatch(background, /supabase|access_token|refresh_token|password/i);
  assert.match(background, /url\.hostname/);
});
