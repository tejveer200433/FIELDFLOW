import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isTransientServiceError } from "../src/shared/serviceErrors.js";

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("temporary Supabase and network failures are classified as retryable", () => {
  for (const error of [
    { status: 503, message: "Service unavailable" },
    { status: 429, message: "Too many requests" },
    { code: "PGRST000", message: "Database connection unavailable" },
    { code: "08006", message: "Connection failure" },
    new TypeError("Failed to fetch")
  ]) {
    assert.equal(isTransientServiceError(error), true);
  }
});

test("invalid credentials and missing records are not treated as service outages", () => {
  assert.equal(isTransientServiceError({ status: 401, message: "Invalid JWT" }), false);
  assert.equal(isTransientServiceError({ status: 403, message: "Permission denied" }), false);
  assert.equal(isTransientServiceError({ code: "PGRST116", message: "No rows" }), false);
});

test("server session validation keeps outages separate from expired sessions", async () => {
  const source = await read("src/backend/supabase/supabaseServer.js");
  assert.match(source, /throwIfServiceUnavailable\(authError, "Authentication service temporarily unavailable/);
  assert.match(source, /if \(authError \|\| !auth\.user\) throw new ApiError\("Invalid or expired session\.", 401\)/);
  assert.match(source, /throwIfServiceUnavailable\(profileError, "Profile service temporarily unavailable/);
});

test("activity endpoints preserve service outages as 503 responses", async () => {
  const source = await read("src/backend/activity/responses.js");
  assert.match(source, /\[401, 403, 503\]/);
  assert.match(source, /SERVICE_UNAVAILABLE/);
});

test("browser access guard retries outages without signing the user out", async () => {
  const source = await read("src/frontend/lib/authClient.js");
  const transientBranch = source.indexOf("isTransientServiceError(error) || isTransientServiceError(accessError)");
  const signOutBranch = source.indexOf("await supabase.auth.signOut()", transientBranch);
  assert.ok(transientBranch > -1);
  assert.ok(signOutBranch > transientBranch);
  assert.match(source, /return retry\(attempt\)/);
  assert.match(source, /Math\.min\(30000/);
  assert.match(source, /error=permissions/);
});
