import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "src/frontend/features/dashboard/components/AdminDashboard.js"), "utf8");

test("admin dashboard uses a living operations hierarchy without replacing existing workflows", () => {
  for (const label of ["See what needs you now.", "Operations briefing", "Review dispatch", "Open live map", "Dispatch Queue", "Alerts", "Team Roster", "Task Activity", "Site Coverage"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /MonitoringSystemPulse/);
  assert.match(source, /router\.push\("\/admin\/field-tasks"\)/);
  assert.match(source, /router\.push\("\/admin\/map"\)/);
  assert.match(source, /allowed\("tasks",[^\n]+"\/api\/tasks"\)/);
  assert.match(source, /allowed\("attendance",[^\n]+"\/api\/attendance"\)/);
  assert.match(source, /allowed\("employees",[^\n]+"\/api\/employees"\)/);
  assert.doesNotMatch(source, /SpeechSynthesis|speechSynthesis|AudioContext/);
});
