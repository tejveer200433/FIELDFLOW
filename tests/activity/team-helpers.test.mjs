import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function importSource(path) {
  const source = readFileSync(join(process.cwd(), path), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

test("team status helper supports all neutral states", async () => {
  const { isTeamActivityStatus, statusTone } = await importSource("src/lib/activity/teamStatus.js");
  for (const status of ["active", "idle", "offline", "not_tracking"]) assert.equal(isTeamActivityStatus(status), true);
  assert.equal(isTeamActivityStatus("unproductive"), false);
  assert.equal(statusTone("active"), "emerald");
  assert.equal(statusTone("idle"), "amber");
  assert.equal(statusTone("offline"), "slate");
});

test("loaded-row filtering is safe and deterministic", async () => {
  const { filterLoadedTeamRows } = await importSource("src/lib/activity/teamStatus.js");
  const rows = [
    { employeeId: "1", employeeName: "Asha Rao", deviceStatus: "active", currentStatus: "active", activeSessionId: "s1" },
    { employeeId: "2", employeeName: "Dev Singh", deviceStatus: "active", currentStatus: "offline", activeSessionId: "s2" },
    { employeeId: "3", employeeName: "Mina Shah", deviceStatus: "pending", currentStatus: "not_tracking", activeSessionId: null }
  ];
  assert.deepEqual(filterLoadedTeamRows(rows, { search: "asha" }).map(row => row.employeeId), ["1"]);
  assert.deepEqual(filterLoadedTeamRows(rows, { deviceStatus: "offline" }).map(row => row.employeeId), ["2"]);
  assert.deepEqual(filterLoadedTeamRows(rows, { deviceStatus: "pending" }).map(row => row.employeeId), ["3"]);
});

test("cursor pages merge without duplicate employees", async () => {
  const { mergeTeamPages } = await importSource("src/lib/activity/teamStatus.js");
  const merged = mergeTeamPages(
    [{ employeeId: "1", employeeName: "Old" }],
    [{ employeeId: "1", employeeName: "Updated" }, { employeeId: "2", employeeName: "New" }]
  );
  assert.equal(merged.length, 2);
  assert.equal(merged.find(row => row.employeeId === "1").employeeName, "Updated");
});
