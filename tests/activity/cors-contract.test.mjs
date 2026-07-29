import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const middleware = await readFile(new URL("../../src/middleware.js", import.meta.url), "utf8");

test("activity CORS middleware is restricted to the activity API namespace", () => {
  assert.match(middleware, /matcher:\s*"\/api\/activity\/:path\*"/);
});

test("activity CORS middleware allows only the desktop-agent origins", () => {
  assert.match(middleware, /http:\/\/localhost:1420/);
  assert.match(middleware, /http:\/\/tauri\.localhost/);
  assert.match(middleware, /tauri:\/\/localhost/);
  assert.match(middleware, /activityAgentOrigins\.has\(origin\)/);
  assert.doesNotMatch(middleware, /Access-Control-Allow-Origin",\s*"\*"/);
});

test("activity CORS middleware handles preflight without weakening authentication", () => {
  assert.match(middleware, /request\.method === "OPTIONS"/);
  assert.match(middleware, /status:\s*204/);
  assert.match(middleware, /status:\s*403/);
  assert.match(middleware, /Authorization, Content-Type/);
  assert.match(middleware, /GET, POST, PATCH, OPTIONS/);
  assert.doesNotMatch(middleware, /Access-Control-Allow-Credentials/);
});
