import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routeUrl = new URL("../src/app/api/profile/avatar/route.js", import.meta.url);
const migrationUrl = new URL("../supabase/migrations/202608120002_profile_avatars.sql", import.meta.url);
const workspaceUrl = new URL("../src/frontend/features/employee/components/EmployeeWorkspace.js", import.meta.url);
const shellUrl = new URL("../src/frontend/components/layout/EmployeeShell.js", import.meta.url);

test("profile avatar API validates ownership, type, and size", async () => {
  const route = await readFile(routeUrl, "utf8");
  assert.match(route, /requireSession\(request\)/);
  assert.match(route, /MAX_BYTES = 5 \* 1024 \* 1024/);
  assert.match(route, /image\/jpeg/);
  assert.match(route, /image\/png/);
  assert.match(route, /image\/webp/);
  assert.match(route, /set_my_avatar_path/);
  assert.match(route, /session\.profile\.id.*avatar-/s);
});

test("profile avatar storage is private and scoped to the authenticated folder", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /'profile-images'/);
  assert.match(migration, /false,/);
  assert.match(migration, /storage\.foldername\(name\).*auth\.uid\(\)::text/s);
  assert.match(migration, /security definer/);
  assert.match(migration, /where id = auth\.uid\(\)/);
});

test("employee can upload, replace, and remove the visible profile photo", async () => {
  const [workspace, shell] = await Promise.all([readFile(workspaceUrl, "utf8"), readFile(shellUrl, "utf8")]);
  assert.match(workspace, /Change photo/);
  assert.match(workspace, /Upload photo/);
  assert.match(workspace, /Remove/);
  assert.match(workspace, /\/api\/profile\/avatar/);
  assert.match(shell, /fieldflow:profile-avatar/);
});

