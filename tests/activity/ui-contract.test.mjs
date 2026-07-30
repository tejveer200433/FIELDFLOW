import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = path => readFileSync(join(root, path), "utf8");
const page = read("src/components/activity/EmployeeActivityPage.js");
const client = read("src/lib/activity/client.js");
const shell = read("src/components/EmployeeShell.js");
const deviceList = read("src/components/activity/ActivityDeviceList.js");
const privacy = read("src/components/activity/ActivityPrivacyNotice.js");

test("employee activity is a separate permission-controlled static route", () => {
  assert.match(read("src/app/employee/activity/page.js"), /<EmployeeShell><EmployeeActivityPage \/><\/EmployeeShell>/);
  assert.match(page, /hasPermission\(access, ACTIVITY_VIEW_SELF\)/);
  assert.match(page, /const employeeId = access\?\.profile\?\.id/);
  assert.doesNotMatch(page, /useParams|useSearchParams|employeeId.*setEmployeeId/);
  assert.match(page, /if \(!permitted\)[\s\S]*Module not available/);
});

test("navigation appends My Activity without changing permission filtering", () => {
  assert.match(shell, /\["profile", "Me", UserRound, \[\]\],\s*\["activity", "My Activity", Activity, \["activity\.view_self"\]\]/);
  assert.match(shell, /nav\.filter\(item => !item\[3\]\.length \|\| hasAnyPermission\(access, item\[3\]\)\)/);
});

test("browser client is activity-scoped and reuses authenticatedFetch", () => {
  assert.match(client, /import \{ authenticatedFetch \} from "@\/lib\/apiClient"/);
  assert.match(client, /authenticatedFetch\(`\/api\/activity\$\{path\}`/);
  assert.doesNotMatch(client, /supabase|service.?role/i);
  assert.doesNotMatch(client, /\/api\/(projects|tasks|attendance|locations)/);
});

test("session controls are explicit and do not auto-start", () => {
  const current = read("src/components/activity/CurrentTrackingSession.js");
  assert.match(current, /"Start tracking"/);
  assert.match(page, /window\.confirm\("Stop your current tracking session\?"\)/);
  assert.doesNotMatch(current, /useEffect\([\s\S]{0,200}onStart\(/);
  assert.match(page, /busy === "start" \|\| busy === "stop"/);
});

test("monitoring and empty states are represented", () => {
  const status = read("src/lib/activity/status.js");
  for (const label of [
    "Tracking error", "Monitoring unavailable", "Monitoring disabled by organisation",
    "Acknowledgement required", "Device offline", "Tracking active", "Ready to track"
  ]) assert.match(status, new RegExp(label));
  assert.match(page, /No heartbeat has been received/);
});

test("sensitive device data and raw activity values are never rendered", () => {
  assert.doesNotMatch(deviceList, /identifier|token|hash|keystroke|keyboard_event|mouse_event/i);
  assert.doesNotMatch(page, /keyboardEventCount|mouseEventCount|typedText|clipboard|screenshot/);
  assert.match(privacy, /Actual typed characters/);
  assert.match(privacy, /Screenshots/);
});

test("aggregate keyboard and mouse counts are returned and shown without event details", () => {
  const inputSummary = read("src/components/activity/InputActivitySummary.js");
  const employeeRoute = read("src/app/api/activity/employees/[employeeId]/route.js");
  assert.match(employeeRoute, /keyboard_event_count,mouse_event_count/);
  assert.match(employeeRoute, /todayInputActivity/);
  assert.match(inputSummary, /Keyboard events/);
  assert.match(inputSummary, /Mouse events/);
  assert.match(inputSummary, /typed keys and mouse coordinates are never collected/);
  assert.doesNotMatch(inputSummary, /keyCode|scanCode|coordinates:|clickTarget|typedText/);
});

test("polling is visibility-aware, overlap-safe, and cleaned up", () => {
  assert.match(page, /requestInFlight\.current/);
  assert.match(page, /document\.visibilityState === "visible"/);
  assert.match(page, /window\.clearInterval\(timer\)/);
  assert.match(page, /Math\.max\(30000, Math\.min\(60000/);
});

test("rate-limit errors keep safe API code and retry information", () => {
  assert.match(client, /response\.headers\.get\("Retry-After"\)/);
  assert.match(read("src/components/activity/ActivityErrorState.js"), /error\?\.status === 429/);
});
