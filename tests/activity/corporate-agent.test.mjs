import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseDeviceUpdate } from "../../src/backend/activity/validation.mjs";

const migration = await readFile(new URL("../../supabase/migrations/202608310001_corporate_agent_management.sql", import.meta.url), "utf8");
const heartbeat = await readFile(new URL("../../src/app/api/activity/heartbeat/route.js", import.meta.url), "utf8");
const deviceRoute = await readFile(new URL("../../src/app/api/activity/devices/[deviceId]/route.js", import.meta.url), "utf8");

test("device management actions are strictly validated", () => {
  assert.equal(parseDeviceUpdate({ action: "set-corporate-mode" }).action, "set-corporate-mode");
  assert.equal(parseDeviceUpdate({ action: "set-standard-mode" }).action, "set-standard-mode");
  assert.throws(() => parseDeviceUpdate({ action: "hide-agent" }), /action must be one of/);
});

test("corporate management is administrator-only and audited", () => {
  assert.match(migration, /activity\.policies\.manage/);
  assert.match(migration, /public\.is_owner\(auth\.uid\(\)\)/);
  assert.match(migration, /device\.management_changed/);
  assert.match(migration, /employee_sign_out_allowed = \(p_agent_mode = 'standard'\)/);
  assert.match(migration, /employee_quit_allowed = \(p_agent_mode = 'standard'\)/);
});

test("device route uses the audited management RPC", () => {
  assert.match(deviceRoute, /activity_set_device_management/);
  assert.match(deviceRoute, /set-corporate-mode/);
  assert.match(deviceRoute, /set-standard-mode/);
});

test("heartbeat returns authoritative management controls", () => {
  assert.match(heartbeat, /agentManagement/);
  assert.match(heartbeat, /employeeSignOutAllowed/);
  assert.match(heartbeat, /autoStartTracking/);
  assert.match(heartbeat, /recoveryEnabled/);
});
