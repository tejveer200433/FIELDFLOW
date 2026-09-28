import test from "node:test";
import assert from "node:assert/strict";
import { readCompatibleDeviceQuery } from "../../src/backend/activity/deviceSchema.mjs";

const fields = "id,employee_id,status,agent_mode,managed_by";
test("a missing management column retries only the original scoped query with base fields", async () => {
  const calls = [];
  const build = async selection => {
    calls.push({ selection, employee: "original-scope", limit: 25 });
    return selection.includes("agent_mode") ? { error: { code: "42703", message: "column employee_devices.agent_mode does not exist" } } : { data: [{ id: "device" }], error: null };
  };
  assert.equal((await readCompatibleDeviceQuery(build, fields)).data[0].id, "device");
  assert.deepEqual(calls, [
    { selection: fields, employee: "original-scope", limit: 25 },
    { selection: "id,employee_id,status", employee: "original-scope", limit: 25 }
  ]);
});
test("schema compatibility never suppresses denied access or a missing core column", async () => {
  for (const error of [{ code: "42501", message: "permission denied" }, { code: "42703", message: "column employee_devices.status does not exist" }]) {
    let calls = 0;
    const result = await readCompatibleDeviceQuery(async () => { calls++; return { error }; }, fields);
    assert.equal(calls, 1); assert.equal(result.error, error);
  }
});
test("a current database makes only one request and retains management policy fields", async () => {
  let calls = 0;
  const data = [{ id: "device", agent_mode: "corporate" }];
  const result = await readCompatibleDeviceQuery(async selection => { calls++; assert.equal(selection, fields); return { data, error: null }; }, fields);
  assert.equal(calls, 1); assert.equal(result.data[0].agent_mode, "corporate");
});
