import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("effective web access policy endpoint is authenticated, device-scoped, and read-only", () => {
  const source = readFileSync("src/app/api/activity/web-access/policy/route.js", "utf8");
  assert.match(source, /requireActivitySession/);
  assert.match(source, /requireOwnedDevice/);
  assert.match(source, /web_access_effective_policy/);
  assert.match(source, /export async function GET/);
  assert.doesNotMatch(source, /export async function (POST|PATCH|DELETE)/);
});
