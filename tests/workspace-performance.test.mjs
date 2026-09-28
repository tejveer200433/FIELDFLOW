import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("workspace bootstrap parallelizes profile and RBAC checks without weakening either check", async () => {
  const source = await read("src/frontend/lib/authClient.js");
  assert.match(source, /Promise\.all\(\[/);
  assert.match(source, /from\("profiles"\)/);
  assert.match(source, /rpc\("get_my_access_context"\)/);
  assert.match(source, /profile\.approval_status !== "approved" \|\| !profile\.active/);
  assert.match(source, /if \(accessError \|\| !accessData\)/);
  assert.match(source, /workspaceForAccess\(resolvedAccess\)/);
  assert.doesNotMatch(source, /legacyAccess/);
});

test("avatar signing is deferred until after verified access is rendered", async () => {
  const source = await read("src/frontend/lib/authClient.js");
  const accessRender = source.indexOf("setAccess({ ...resolvedAccess, profile })");
  const signedAvatar = source.indexOf("createSignedUrl");
  assert.ok(accessRender > -1);
  assert.ok(signedAvatar > accessRender);
});

test("concurrent API calls share only an in-flight session read", async () => {
  const source = await read("src/frontend/lib/apiClient.js");
  assert.match(source, /let sessionRequest = null/);
  assert.match(source, /if \(sessionRequest\) return sessionRequest/);
  assert.match(source, /sessionRequest === request\) sessionRequest = null/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});

test("non-critical notifications wait for verified access and avoid hidden-tab polling", async () => {
  const [hook, managerShell, employeeShell] = await Promise.all([
    read("src/frontend/lib/notificationsClient.js"),
    read("src/frontend/components/layout/RoleShell.js"),
    read("src/frontend/components/layout/EmployeeShell.js")
  ]);
  assert.match(managerShell, /useNotifications\(\{ enabled: Boolean\(access\) \}\)/);
  assert.match(employeeShell, /useNotifications\(\{ enabled: Boolean\(access\) \}\)/);
  assert.match(hook, /initialDelay = 1200/);
  assert.match(hook, /interval = 30000/);
  assert.match(hook, /document\.visibilityState === "visible"/);
  assert.match(hook, /inFlight\.current/);
  assert.match(hook, /navigator\.onLine/);
  assert.match(hook, /window\.addEventListener\("online", refreshWhenAvailable\)/);
  assert.match(hook, /Math\.min\(5 \* 60 \* 1000/);
  assert.doesNotMatch(hook, /setInterval/);
});

test("the manager dashboard defers its map until primary services settle", async () => {
  const source = await read("src/frontend/features/dashboard/components/ManagerDashboard.js");
  assert.match(source, /Object\.values\(serviceState\)\.every\(status => status !== "loading"\)/);
  assert.match(source, /mapReady \? <LiveTeamMap \/>/);
});

test("the admin dashboard has a separate map-first live operations view", async () => {
  const [dashboard, workspace] = await Promise.all([
    read("src/frontend/features/dashboard/components/AdminDashboard.js"),
    read("src/frontend/features/manager/components/ManagerWorkspace.js")
  ]);
  assert.match(workspace, /role === "admin" \? <AdminDashboard access=\{access\} \/> : <ManagerDashboard access=\{access\} \/>/);
  assert.match(dashboard, /Operations · live/);
  assert.match(dashboard, /Dispatch Queue/);
  assert.match(dashboard, /Site Coverage \(Today\)/);
  assert.match(dashboard, /mapReady \? <LiveTeamMap \/>/);
  for (const endpoint of ["/api/tasks", "/api/attendance", "/api/employees", "/api/sos"]) {
    assert.match(dashboard, new RegExp(endpoint));
  }
  assert.doesNotMatch(dashboard, /managerEmployees|managerTasks|demo|mock/i);
});
