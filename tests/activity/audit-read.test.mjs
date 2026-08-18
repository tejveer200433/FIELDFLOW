import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = relativePath => readFile(new URL(`../../${relativePath}`, import.meta.url), "utf8");

test("monitoring audit endpoint requires all-workforce or policy-management permission", async () => {
  const route = await read("src/app/api/activity/audit/route.js");
  assert.match(route, /ACTIVITY_PERMISSIONS\.managePolicies/);
  assert.match(route, /ACTIVITY_PERMISSIONS\.viewAll/);
  assert.match(route, /requireActivitySession/);
  assert.match(route, /await enforceActivityRateLimit\(session\.client, "audit-read"/);
});

test("monitoring audit response excludes metadata and entity identifiers", async () => {
  const route = await read("src/app/api/activity/audit/route.js");
  const selection = route.match(/\.select\("([^"]+)"\)/)?.[1] || "";
  assert.doesNotMatch(selection, /metadata|entity_id/);
  assert.doesNotMatch(route, /row\.metadata|row\.entity_id/);
  assert.match(route, /actorName/);
  assert.match(route, /employeeName/);
});

test("monitoring audit UI renders safe event summaries with pagination", async () => {
  const component = await read("src/frontend/features/activity/components/MonitoringAuditLog.js");
  assert.match(component, /getMonitoringAuditLog/);
  assert.match(component, /Load older events/);
  assert.match(component, /Sensitive metadata is never returned/);
  assert.doesNotMatch(component, /event\.metadata|entityId|rawMetadata/);
});
