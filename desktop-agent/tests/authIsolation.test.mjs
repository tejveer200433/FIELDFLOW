import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const auth = readFileSync(new URL("../src/lib/auth.js", import.meta.url), "utf8");

test("desktop sign-out never revokes the employee's other FieldFlow sessions", () => {
  assert.match(app, /clearFieldFlowSession\(supabase\)/);
  assert.doesNotMatch(app, /supabase\.auth\.signOut/);
  assert.match(auth, /secureSessionStorage\.withExplicitRemoval/);
  assert.match(auth, /supabase\.auth\.signOut\(\{ scope: "local" \}\)/);
  assert.doesNotMatch(app, /supabase\.auth\.signOut\(\)/);
});

test("only an explicit employee sign-out clears the FieldFlow session", () => {
  const beforeManualSignOut = app.slice(0, app.indexOf("async function signOut()"));
  const manualSignOut = app.slice(app.indexOf("async function signOut()"));
  assert.doesNotMatch(beforeManualSignOut, /clearFieldFlowSession\(supabase\)/);
  assert.match(manualSignOut, /clearFieldFlowSession\(supabase\)/);
  assert.doesNotMatch(app, /AUTH_SESSION_REVOKED/);
});

test("auth operations use a cross-context Web Lock with a serialized fallback", () => {
  assert.match(auth, /navigator\?\.locks\?\.request/);
  assert.match(auth, /fieldflow:\$\{name\}/);
  assert.match(auth, /fallbackLocks/);
  assert.match(auth, /lock: fieldFlowAuthLock/);
});
