import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("desktop sign-out never revokes the employee's other FieldFlow sessions", () => {
  const signOutCalls = app.match(/supabase\.auth\.signOut\([^)]*\)/g) || [];

  assert.equal(signOutCalls.length, 2);
  assert.ok(signOutCalls.every(call => call.includes('scope: "local"')));
  assert.doesNotMatch(app, /supabase\.auth\.signOut\(\)/);
});
