import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migration = readFileSync(join(root, "supabase/migrations/202608260002_verified_work_evidence.sql"), "utf8");
const route = readFileSync(join(root, "src/app/api/tasks/[taskId]/evidence/route.js"), "utf8");
const panel = readFileSync(join(root, "src/frontend/features/tasks/components/TaskWorkEvidence.js"), "utf8");

test("verified work evidence is task-scoped, aggregate-only, and employee-contextual", () => {
  assert.match(migration, /create table public\.task_work_evidence_contexts/);
  assert.match(migration, /public\.can_access_task\(task_id\)/);
  assert.match(migration, /public\.is_task_assignee\(task_id, auth\.uid\(\)\)/);
  assert.match(migration, /create or replace function public\.task_work_evidence_summary/);
  assert.match(migration, /public\.activity_integrity_events/);
  assert.match(migration, /without returning raw activity, application, website, screenshot, hardware, or integrity digest/i);
  assert.match(migration, /revoke all on public\.task_work_evidence_contexts from anon, authenticated/);
  assert.match(route, /requireAnyPermission/);
  assert.match(route, /can_access_task/);
  assert.match(route, /is_task_assignee/);
  assert.match(route, /note\.length > 1000/);
  assert.doesNotMatch(route, /service_role/i);
});

test("work evidence UI explains confidence without framing it as an automated decision", () => {
  assert.match(panel, /Verified Work Evidence/);
  assert.match(panel, /not an automated performance decision/);
  assert.match(panel, /Employee context/);
  assert.match(panel, /Open checks/);
  assert.doesNotMatch(panel, /screenshot|keystroke|clipboard/i);
});
