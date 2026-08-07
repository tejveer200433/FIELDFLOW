import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = path => readFileSync(join(root, path), "utf8");

const migration = read("supabase/migrations/202608060003_notifications.sql");

test("notifications table is fan-out, RLS-scoped to the recipient, and insert/delete are RPC-only", () => {
  assert.match(migration, /create type public\.notification_type as enum \(\s*'expense_submitted', 'report_submitted', 'task_completed', 'attendance_geofence_violation'/);
  assert.match(migration, /create table public\.notifications/);
  assert.match(migration, /recipient_id uuid not null references public\.profiles\(id\)/);
  assert.match(migration, /alter table public\.notifications enable row level security/);
  assert.match(migration, /create policy notifications_read on public\.notifications for select to authenticated using \(\s*recipient_id = auth\.uid\(\)/);
  assert.match(migration, /create policy notifications_mark_read on public\.notifications for update to authenticated\s*using \(recipient_id = auth\.uid\(\)\)\s*with check \(recipient_id = auth\.uid\(\)\)/);
  assert.match(migration, /revoke insert, delete on public\.notifications from authenticated/);
});

test("has_permission_as checks an arbitrary target user, not the caller", () => {
  assert.match(migration, /function public\.has_permission_as\(p_user_id uuid, p_permission_key text\)/);
  assert.match(migration, /public\.is_owner\(p_user_id\)/);
  assert.match(migration, /where profile\.id = p_user_id/);
  assert.doesNotMatch(migration, /has_permission_as[\s\S]{0,400}auth\.uid\(\)/);
});

test("notify_event resolves recipients as supervisor-with-permission union owner/view_all, excludes the actor, and is RPC-only", () => {
  assert.match(migration, /function public\.notify_event\(/);
  assert.match(migration, /select distinct team\.supervisor_id as user_id\s*from public\.team_members member\s*join public\.teams team on team\.id = member\.team_id\s*where member\.user_id = p_employee_id\s*and public\.has_permission_as\(team\.supervisor_id, p_permission_key\)/);
  assert.match(migration, /public\.has_permission_as\(profile\.id, 'employees\.view_all'\)/);
  assert.match(migration, /where recipients\.user_id <> p_employee_id/);
  assert.match(migration, /revoke all on function public\.notify_event\([\s\S]*?\) from public/);
  assert.match(migration, /grant execute on function public\.notify_event\([\s\S]*?\) to authenticated/);
});

test("notifyEvent helper swallows failures so a notification error never blocks the action it reports on", () => {
  const source = read("src/lib/supabaseServer.js");
  assert.match(source, /export async function notifyEvent\(client, \{/);
  assert.match(source, /await client\.rpc\("notify_event", \{/);
  assert.match(source, /export async function notifyEvent\(client, \{[\s\S]*?try \{[\s\S]*?\} catch \(error\) \{[\s\S]*?console\.error\([\s\S]*?\}\n\}/);
});

test("expense submission notifies approvers after the insert succeeds", () => {
  const source = read("src/app/api/expenses/route.js");
  const postBody = source.slice(source.indexOf("export async function POST"));
  assert.match(postBody, /if \(error\) throw error;[\s\S]*notifyEvent\(client, \{[\s\S]*permissionKey: "expenses\.approve"[\s\S]*type: "expense_submitted"[\s\S]*entityType: "expense"/);
});

test("daily report submission notifies reviewers after the insert succeeds", () => {
  const source = read("src/app/api/reports/route.js");
  const postBody = source.slice(source.indexOf("export async function POST"));
  assert.match(postBody, /if \(error\) throw error;[\s\S]*notifyEvent\(client, \{[\s\S]*permissionKey: "reports\.review"[\s\S]*type: "report_submitted"[\s\S]*entityType: "daily_report"/);
});

test("task completion notifies assigners, but other status transitions do not", () => {
  const source = read("src/app/api/tasks/route.js");
  assert.match(source, /if \(body\.status === "Completed"\) \{\s*await notifyEvent\(session\.client, \{[\s\S]*permissionKey: "tasks\.assign"[\s\S]*type: "task_completed"[\s\S]*entityType: "task"/);
});

test("attendance geofence rejection notifies team viewers without changing the employee's 403", () => {
  const source = read("src/app/api/attendance/route.js");
  assert.match(source, /async function notifyIfOutOfRadius\(client, profile, action, error\) \{\s*if \(!error\?\.message\?\.includes\(OUT_OF_RADIUS_MESSAGE\)\) return;/);
  assert.match(source, /permissionKey: "attendance\.view_team"[\s\S]*type: "attendance_geofence_violation"/);
  assert.match(source, /await notifyIfOutOfRadius\(client, profile, "check-in", error\);\s*throwRpcError\(error\);/);
  assert.match(source, /await notifyIfOutOfRadius\(client, profile, "check-out", error\);\s*throwRpcError\(error\);/);
});

test("the notifications route relies on RLS for recipient scoping and validates its own inputs", () => {
  const source = read("src/app/api/notifications/route.js");
  assert.match(source, /requireSession\(request\)/);
  assert.doesNotMatch(source, /requirePermission|requireAnyPermission/);
  assert.match(source, /count: "exact", head: true/);
  assert.match(source, /if \(body\.all\)/);
  assert.match(source, /throw new ApiError\("Provide either \{ all: true \} or a non-empty ids array\."\)/);
});

test("RoleShell renders a real unread badge and notification list instead of the static placeholder", () => {
  const source = read("src/components/RoleShell.js");
  assert.match(source, /useNotifications\(\)/);
  assert.match(source, /\{unreadCount > 0 && <span[\s\S]{0,120}bg-rose-500/);
  assert.match(source, /\{unreadCount > 9 \? "9\+" : unreadCount\}/);
  assert.match(source, /notifications\.map\(item =>/);
  assert.match(source, /onClick=\{markAllRead\}/);
});
