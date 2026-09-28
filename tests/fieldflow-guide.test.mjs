import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routeUrl = new URL("../src/app/api/ai/employee-guide/route.js", import.meta.url);
const guideServerUrl = new URL("../src/backend/ai/fieldflowGuide.js", import.meta.url);
const guideUiUrl = new URL("../src/frontend/features/employee/components/FieldFlowGuide.js", import.meta.url);

test("employee Guide builds context from the authenticated employee scope", async () => {
  const route = await readFile(routeUrl, "utf8");

  assert.match(route, /requirePermission\(request, PERMISSIONS\.dashboardView\)/);
  assert.match(route, /eq\("employee_id", profile\.id\)/);
  assert.match(route, /task_assignees/);
  assert.match(route, /assignedIds\.has\(task\.id\)/);
  assert.doesNotMatch(route, /service_role|SUPABASE_SERVICE_ROLE_KEY/);
});

test("Guide model requests are bounded, non-stored, and restricted to navigation", async () => {
  const server = await readFile(guideServerUrl, "utf8");

  assert.match(server, /message\.length > 800/);
  assert.match(server, /Array\.isArray\(body\?\.history\) \? body\.history\.slice\(-8\)/);
  assert.match(server, /store: false/);
  assert.match(server, /safety_identifier:/);
  assert.match(server, /payload\?\.output/);
  assert.match(server, /item\?\.type === "output_text"/);
  assert.match(server, /max_output_tokens: 800/);
  assert.match(server, /type: \{ type: "string", enum: \["navigate"\] \}/);
  assert.match(server, /allowedRoutes\.has\(action\.route\)/);
  assert.doesNotMatch(server, /\/employee\/employees|\/admin\//);
});

test("Guide degrades to trusted guidance without exposing write controls", async () => {
  const [route, ui] = await Promise.all([readFile(routeUrl, "utf8"), readFile(guideUiUrl, "utf8")]);

  assert.match(route, /if \(!externalAiEnabled \|\| !apiKey\)/);
  assert.match(route, /FIELDFLOW_AI_ENABLED === "true"/);
  assert.match(route, /mode: "guided"/);
  assert.match(route, /fallbackGuideResponse/);
  assert.match(ui, /AI guidance can be incomplete/);
  assert.match(ui, /router\.push\(action\.route\)/);
  assert.doesNotMatch(ui, /method:\s*"PATCH"|method:\s*"DELETE"/);
});
