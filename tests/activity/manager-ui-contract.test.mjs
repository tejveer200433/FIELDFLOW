import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = path => readFileSync(join(root, path), "utf8");
const page = read("src/components/activity/ManagerTeamActivityPage.js");
const client = read("src/lib/activity/managerClient.js");
const shell = read("src/components/RoleShell.js");
const table = read("src/components/activity/TeamActivityTable.js");
const drawer = read("src/components/activity/TeamActivityEmployeeDrawer.js");

test("manager activity is a separate guarded static route", () => {
  assert.match(read("src/app/manager/activity/page.js"), /<RoleShell role="manager"><ManagerTeamActivityPage \/><\/RoleShell>/);
  assert.match(page, /TEAM_PERMISSIONS = \["activity\.view_team", "activity\.view_all"\]/);
  assert.match(page, /access\?\.isOwner \|\| hasAnyPermission\(access, TEAM_PERMISSIONS\)/);
  assert.match(page, /if \(!permitted\)[\s\S]*Module not available/);
});

test("Team Activity is appended only to manager navigation", () => {
  assert.match(shell, /manager:\s*\[\s*\.\.\.managementNav,\s*\["activity", "Team Activity", Activity, \["activity\.view_team", "activity\.view_all"\]\]/);
  const adminBlock = shell.match(/admin:\s*\[([\s\S]*?)\]\s*\n\};/);
  assert.ok(adminBlock);
  assert.doesNotMatch(adminBlock[1], /Team Activity/);
});

test("manager client uses only authenticated activity endpoints", () => {
  assert.match(client, /authenticatedFetch\(`\/api\/activity\$\{path\}`/);
  assert.match(client, /\/team\?/);
  assert.match(client, /\/employees\/\$\{encodeURIComponent\(employeeId\)\}/);
  assert.doesNotMatch(client, /supabase|service.?role/i);
  assert.doesNotMatch(client, /\/api\/(attendance|locations|projects|tasks|employees)/);
});

test("team data is never populated with demo or unrestricted records", () => {
  assert.doesNotMatch(page, /managerEmployees|demo|mock/i);
  assert.match(page, /getTeamActivity\(/);
  assert.doesNotMatch(page, /employeeId.*input|useSearchParams|useParams/);
});

test("filters debounce search, reset pagination, and preserve safe server filters", () => {
  const filters = read("src/components/activity/TeamActivityFilters.js");
  assert.match(filters, /window\.setTimeout\([\s\S]*350/);
  assert.match(filters, /window\.clearTimeout\(timer\)/);
  assert.match(page, /setNextCursor\(null\)/);
  assert.match(client, /allowedStatuses/);
  assert.match(client, /allowedSorts/);
});

test("team table is responsive and opens scoped employee details", () => {
  assert.match(table, /hidden overflow-x-auto md:block/);
  assert.match(table, /md:hidden/);
  assert.match(table, /onSelect\(row\)/);
  assert.match(page, /setSelectedId\(row\.employeeId\)/);
  assert.match(drawer, /getEmployeeActivityDetails\(employee\.employeeId/);
});

test("a permission loss clears team rows and closes details", () => {
  assert.match(page, /requestError\?\.status === 403/);
  assert.match(page, /setRows\(\[\]\)/);
  assert.match(page, /setSelectedId\(null\)/);
  assert.match(drawer, /setDetails\(null\)/);
});

test("sensitive monitoring fields and raw sample values are not rendered", () => {
  for (const source of [page, table, drawer]) {
    assert.doesNotMatch(source, /deviceIdentifier|identifierHash|typedText|clipboard|keyCode|mouseCoordinates|keyboardEventCount|mouseEventCount/);
  }
});

test("neutral Activity level explanation is always visible", () => {
  assert.match(page, /Activity level is based on recorded keyboard and mouse activity counts/);
  assert.match(page, /should not be interpreted as a complete measure of productivity or work quality/);
  assert.doesNotMatch(page, /lazy|low performer|unproductive|poor activity/i);
});

test("live polling is overlap-safe, visibility-aware, and cleaned up", () => {
  assert.match(page, /inFlight\.current/);
  assert.match(page, /document\.visibilityState === "visible"/);
  assert.match(page, /window\.clearInterval\(timer\)/);
  assert.match(page, /Math\.max\(30000, Math\.min\(60000/);
});

test("rate limit and safe access errors have dedicated UI handling", () => {
  const errorState = read("src/components/activity/TeamActivityErrorState.js");
  assert.match(errorState, /error\?\.status === 429/);
  assert.match(errorState, /error\?\.status === 403/);
  assert.match(client, /response\.headers\.get\("Retry-After"\)/);
});
