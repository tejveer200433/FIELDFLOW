import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("employee attendance polling is overlap-safe and pauses when unavailable", async () => {
  const source = await read("src/frontend/features/attendance/components/EmployeeAttendance.js");
  assert.match(source, /if \(loadRequest\.current\) return loadRequest\.current/);
  assert.match(source, /document\.visibilityState === "visible" && navigator\.onLine/);
  assert.match(source, /setInterval\(refreshWhenVisible, 30000\)/);
  assert.match(source, /window\.addEventListener\("online", refreshWhenVisible\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", refreshWhenVisible\)/);
  assert.doesNotMatch(source, /employee-demo/);
});

test("manager attendance polling cannot overlap and uses a bounded live interval", async () => {
  const source = await read("src/frontend/features/attendance/components/ManagerAttendance.js");
  assert.match(source, /if \(loadRequest\.current\) return loadRequest\.current/);
  assert.match(source, /document\.visibilityState === "visible" && navigator\.onLine/);
  assert.match(source, /setInterval\(refreshWhenVisible, 15000\)/);
  assert.doesNotMatch(source, /setInterval\(load, 5000\)/);
});
