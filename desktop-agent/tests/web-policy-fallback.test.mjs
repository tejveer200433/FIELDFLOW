import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("heartbeat policy refresh preserves the legacy blocklist when no scoped rule applies", () => {
  const source = readFileSync("src/App.jsx", "utf8");
  assert.match(source, /const effectiveWebPolicy = result\.webAccessPolicy\?\.ruleId/);
  assert.match(source, /blockedDomains: result\.blockedDomains \|\| \[\]/);
  assert.match(source, /await applyWebAccessPolicy\(effectiveWebPolicy\)/);
});
