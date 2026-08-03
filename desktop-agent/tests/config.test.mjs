import test from "node:test";
import assert from "node:assert/strict";
import { readConfiguration } from "../src/config.js";

test("configuration reports missing values without exposing secrets", () => {
  const result = readConfiguration({});
  assert.equal(result.valid, false);
  assert.deepEqual(result.missing, ["VITE_FIELDFLOW_API_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]);
});

test("configuration removes trailing URL slashes", () => {
  const result = readConfiguration({
    VITE_FIELDFLOW_API_URL: "http://localhost:3000/",
    VITE_SUPABASE_URL: "https://example.supabase.co///",
    VITE_SUPABASE_ANON_KEY: "public-key"
  });
  assert.equal(result.valid, true);
  assert.equal(result.fieldFlowUrl, "http://localhost:3000");
  assert.equal(result.supabaseUrl, "https://example.supabase.co");
});

test("configuration supports explicit agent version and debug logging", () => {
  const result = readConfiguration({
    VITE_FIELDFLOW_API_URL: "http://localhost:3000",
    VITE_SUPABASE_URL: "https://example.supabase.co",
    VITE_SUPABASE_ANON_KEY: "public-key",
    VITE_AGENT_VERSION: "0.2.0",
    VITE_DEBUG_LOGGING: "true",
    VITE_AGENT_UPDATES_ENABLED: "true"
  });
  assert.equal(result.agentVersion, "0.2.0");
  assert.equal(result.debug, true);
  assert.equal(result.updatesEnabled, true);
});
