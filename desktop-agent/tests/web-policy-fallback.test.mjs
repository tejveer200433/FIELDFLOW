import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("independent policy refresh never erases the legacy blocklist when no scoped rule applies", () => {
  const source = readFileSync("src/App.jsx", "utf8");
  assert.match(source, /if \(!cancelled && current\?\.ruleId\) await applyWebAccessPolicy\(current\)/);
});
