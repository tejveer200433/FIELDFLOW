import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readConfiguration } from "../src/config.js";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

test("configuration supports a separately packaged corporate installer", () => {
  const result = readConfiguration({
    VITE_FIELDFLOW_API_URL: "https://fieldflow.example",
    VITE_SUPABASE_URL: "https://example.supabase.co",
    VITE_SUPABASE_ANON_KEY: "public-key",
    VITE_AGENT_MODE: "corporate"
  });
  assert.equal(result.agentMode, "corporate");
});

test("server device management is authoritative after registration", () => {
  assert.match(appSource, /device \? device\.agentMode === "corporate" : config\.agentMode === "corporate"/);
  assert.match(appSource, /agentMode: result\.agentManagement\?\.mode/);
});

test("corporate mode blocks employee sign-out quit and manual tracking controls", () => {
  assert.match(appSource, /if \(!employeeSignOutAllowed\)/);
  assert.match(appSource, /if \(!employeeQuitAllowed\)/);
  assert.match(appSource, /if \(!corporateMode && session\)/);
  assert.match(appSource, /Tracking and recovery are managed by your organisation/);
});

test("corporate heartbeat restores automatic tracking intent", () => {
  assert.match(appSource, /result\.agentManagement\?\.autoStartTracking/);
  assert.match(appSource, /key: "tracking_desired", value: "true"/);
});
