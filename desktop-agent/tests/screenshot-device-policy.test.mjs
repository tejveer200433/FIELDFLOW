import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("desktop capture requires the effective device setting returned by heartbeat", () => {
  const source = readFileSync(join(process.cwd(), "src/App.jsx"), "utf8");
  assert.match(source, /setScreenshotCaptureEnabled\(Boolean\(result\.collectScreenshots\)\)/);
  assert.match(source, /policy\.collectScreenshots && screenshotCaptureEnabled/);
  assert.match(source, /setScreenshotCaptureEnabled\(false\)/);
});
