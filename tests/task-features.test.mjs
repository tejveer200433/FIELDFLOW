import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = path => readFileSync(join(root, path), "utf8");
const taskRoute = read("src/app/api/tasks/route.js");
const historyRoute = read("src/app/api/tasks/[taskId]/history/route.js");
const migration = read("supabase/migrations/202608130002_task_history.sql");
const manager = read("src/frontend/features/manager/components/ManagerWorkspace.js");
const employee = read("src/frontend/features/employee/components/EmployeeWorkspace.js");
const collaborationMigration = read("supabase/migrations/202608130003_task_collaboration.sql");
const commentsRoute = read("src/app/api/tasks/[taskId]/comments/route.js");
const attachmentsRoute = read("src/app/api/tasks/[taskId]/attachments/route.js");
const collaboration = read("src/frontend/features/tasks/components/TaskCollaboration.js");
const recurrenceMigration = read("supabase/migrations/202608130004_task_recurrence_estimates.sql");
const financialMigration = read("supabase/migrations/202608130006_task_financials.sql");
const financialRoute = read("src/app/api/task-financials/route.js");
const assigneeMigration = read("supabase/migrations/202608130007_task_assignees.sql");
const boardPreferenceMigration = read("supabase/migrations/202608130008_task_board_preferences.sql");
const boardPreferenceRoute = read("src/app/api/task-board-preferences/route.js");
const archiveMigration = read("supabase/migrations/202608140002_task_archiving.sql");

test("task details are editable only through management scope", () => {
  assert.match(taskRoute, /editableTaskFields = \["title", "client", "address", "priority", "scheduledAt", "description", "checklist", "estimatedMinutes", "recurrence", "employeeIds"\]/);
  assert.match(taskRoute, /const detailRequested = editableTaskFields\.some/);
  assert.match(taskRoute, /if \(!detailRequested && statusRequested && !archiveRequested && isAssignedEmployee/);
  assert.match(taskRoute, /resolveUserScope\(session, \{ team: "tasks\.assign", all: "tasks\.manage_all" \}\)/);
  assert.match(taskRoute, /assertUserInScope\(scope, task\.employee_id\)/);
  assert.match(taskRoute, /update\.scheduled_at = body\.scheduledAt \|\| null/);
  assert.match(taskRoute, /update\.description = String\(body\.description/);
});

test("task history is append-only and mirrors task RBAC", () => {
  assert.match(migration, /create table if not exists public\.task_history/);
  assert.match(migration, /after insert or update on public\.tasks/);
  assert.match(migration, /security definer/);
  assert.match(migration, /revoke all on public\.task_history from anon, authenticated/);
  assert.match(migration, /grant select on public\.task_history to authenticated/);
  assert.match(migration, /task\.employee_id = auth\.uid\(\)[\s\S]*tasks\.view_self/);
  assert.match(migration, /tasks\.manage_all/);
  assert.match(migration, /tasks\.assign[\s\S]*is_team_supervisor_for/);
});

test("task history API independently checks the requested task scope", () => {
  assert.match(historyRoute, /requireAnyPermission\(request, \["tasks\.view_self", "tasks\.assign", "tasks\.manage_all"\]\)/);
  assert.match(historyRoute, /rpc\("can_access_task", \{ p_task_id: taskId \}\)/);
  assert.match(historyRoute, /\.limit\(100\)/);
  assert.doesNotMatch(historyRoute, /service.?role/i);
});

test("manager and employee task screens expose schedule and description safely", () => {
  assert.match(manager, /name="scheduledAt" type="datetime-local"/);
  assert.match(manager, /name="description"/);
  assert.match(manager, /Save task/);
  assert.match(manager, /Change history/);
  assert.match(employee, /selected\.scheduledAt/);
  assert.match(employee, /selected\.description/);
});

test("task comments and attachments inherit task RBAC", () => {
  assert.match(collaborationMigration, /function public\.can_access_task/);
  assert.match(collaborationMigration, /task_comments_read[\s\S]*public\.can_access_task\(task_id\)/);
  assert.match(collaborationMigration, /task_comments_insert[\s\S]*author_id = auth\.uid\(\)/);
  assert.match(collaborationMigration, /task_attachments_read[\s\S]*public\.can_access_task\(task_id\)/);
  assert.match(collaborationMigration, /task_files_read[\s\S]*public\.can_access_task\(attachment\.task_id\)/);
  for (const source of [commentsRoute, attachmentsRoute]) {
    assert.match(source, /rpc\("can_access_task", \{ p_task_id: taskId \}\)/);
    assert.doesNotMatch(source, /service.?role/i);
  }
});

test("task attachments are private, type-limited, size-limited, and use short signed URLs", () => {
  assert.match(collaborationMigration, /'task-attachments','task-attachments',false,20971520/);
  assert.match(attachmentsRoute, /file\.size > 20 \* 1024 \* 1024/);
  assert.match(attachmentsRoute, /allowedTypes\.has\(file\.type\)/);
  assert.match(attachmentsRoute, /createSignedUrl\(attachment\.object_path, 300\)/);
  assert.match(attachmentsRoute, /crypto\.randomUUID\(\)/);
  assert.match(attachmentsRoute, /if \(client && uploadedPath\)/);
});

test("employees can update only checklist completion through a scoped RPC", () => {
  assert.match(collaborationMigration, /function public\.update_my_task_checklist/);
  assert.match(collaborationMigration, /task\.employee_id = auth\.uid\(\)/);
  assert.match(taskRoute, /checklistOnlyRequested/);
  assert.match(taskRoute, /session\.client\.rpc\("update_my_task_checklist"/);
  assert.match(manager, /Checklist \(one item per line\)/);
  assert.match(employee, /completedChecklistIds/);
  assert.match(manager, /<TaskCollaboration taskId=\{task\.id\}/);
  assert.match(employee, /<TaskCollaboration taskId=\{selected\.id\}/);
  assert.match(collaboration, /Add a task comment/);
  assert.match(collaboration, /Attach file/);
});

test("recurring task generation is idempotent and permission scoped", () => {
  assert.match(recurrenceMigration, /tasks_recurrence_parent_unique/);
  assert.match(recurrenceMigration, /function public\.create_next_recurring_task/);
  assert.match(recurrenceMigration, /source\.employee_id <> auth\.uid\(\)/);
  assert.match(recurrenceMigration, /select \* into created from public\.tasks where recurrence_parent_id = source\.id/);
  assert.match(recurrenceMigration, /source\.status <> 'Completed' or source\.recurrence = 'none'/);
  assert.match(taskRoute, /session\.client\.rpc\("create_next_recurring_task"/);
});

test("estimated versus actual time uses RLS-visible tracking sessions", () => {
  assert.match(recurrenceMigration, /function public\.task_tracked_seconds/);
  assert.match(recurrenceMigration, /security invoker/);
  assert.match(recurrenceMigration, /from public\.tracking_sessions session/);
  assert.match(taskRoute, /getTrackedSeconds/);
  assert.match(taskRoute, /estimatedMinutes: row\.estimated_minutes/);
  assert.match(taskRoute, /actualMinutes: Math\.round/);
  assert.match(manager, /Estimated minutes/);
  assert.match(manager, /<strong>Tracked:<\/strong>/);
  assert.match(employee, /minutes tracked/);
});

test("task financials are separated from employee task responses and management scoped", () => {
  assert.match(financialMigration, /create table if not exists public\.task_financials/);
  assert.match(financialMigration, /public\.has_permission\('tasks\.manage_all'\)/);
  assert.match(financialMigration, /public\.has_permission\('tasks\.assign'\)[\s\S]*public\.is_team_supervisor_for/);
  assert.match(financialMigration, /updated_by = auth\.uid\(\)/);
  assert.match(financialRoute, /requireAnyPermission\(request, \["tasks\.assign", "tasks\.manage_all"\]\)/);
  assert.match(financialRoute, /assertUserInScope\(scope, task\.employee_id\)/);
  assert.match(financialRoute, /remainingBudget/);
  assert.doesNotMatch(taskRoute, /budgetAmount|hourlyCost|actualCost|remainingBudget/);
  assert.doesNotMatch(employee, /Management financials|Hourly cost|remainingBudget/);
  assert.match(manager, /Management financials/);
});

test("multiple assignees retain legacy primary assignment and enforce scope", () => {
  assert.match(assigneeMigration, /create table if not exists public\.task_assignees/);
  assert.match(assigneeMigration, /primary key \(task_id, employee_id\)/);
  assert.match(assigneeMigration, /function public\.set_task_assignees/);
  assert.match(assigneeMigration, /public\.is_team_supervisor_for\(employee\)/);
  assert.match(assigneeMigration, /update public\.tasks set employee_id = normalized\[1\]/);
  assert.match(assigneeMigration, /public\.is_task_assignee\(p_task_id, auth\.uid\(\)\)/);
  assert.match(assigneeMigration, /create or replace function public\.activity_start_session/);
  assert.match(assigneeMigration, /insert into public\.task_assignees\(task_id,employee_id,assigned_by\)/);
  assert.match(taskRoute, /from\("task_assignees"\)/);
  assert.match(taskRoute, /p_employee_ids: employeeIds/);
  assert.match(taskRoute, /currentEmployeeIds\.includes\(session\.profile\.id\)/);
  assert.match(manager, /name="employeeIds" multiple required/);
});

test("planning views and workflow preferences preserve canonical task states", () => {
  assert.match(boardPreferenceMigration, /create table if not exists public\.task_board_preferences/);
  assert.match(boardPreferenceMigration, /user_id = auth\.uid\(\)/);
  assert.match(boardPreferenceMigration, /tasks\.assign/);
  assert.match(boardPreferenceRoute, /Workflow columns cannot add or remove task states/);
  assert.match(boardPreferenceRoute, /Each workflow column requires a unique order/);
  assert.match(boardPreferenceRoute, /user_id: session\.profile\.id/);
  assert.match(manager, /\[\["board","Board"\],\["timeline","Timeline"\],\["workload","Workload"\]\]/);
  assert.match(manager, /Customize workflow/);
  assert.match(manager, /Task automation continues using their canonical states/);
  assert.match(manager, /employee\.estimated/);
});

test("task archiving is non-destructive, management-scoped, and hidden from employee work", () => {
  assert.match(archiveMigration, /add column if not exists archived_at timestamptz/);
  assert.match(archiveMigration, /add column if not exists archived_by uuid references public\.profiles/);
  assert.doesNotMatch(archiveMigration, /delete from public\.tasks/);
  assert.match(archiveMigration, /join public\.tasks task on task\.id = assignment\.task_id[\s\S]*task\.archived_at is null/);
  assert.match(archiveMigration, /to_jsonb\(new\) - array\['created_by','archived_by'\]/);
  assert.match(taskRoute, /Task view must be active, archived or all/);
  assert.match(taskRoute, /view !== "active" && !canManage/);
  assert.match(taskRoute, /query = query\.is\("archived_at", null\)/);
  assert.match(taskRoute, /query = query\.not\("archived_at", "is", null\)/);
  assert.match(taskRoute, /update\.archived_at = body\.archived \? new Date\(\)\.toISOString\(\) : null/);
  assert.match(taskRoute, /update\.archived_by = body\.archived \? session\.profile\.id : null/);
  assert.match(taskRoute, /Restore this task before changing it/);
  assert.doesNotMatch(taskRoute, /export async function DELETE/);
});

test("manager can archive and restore tasks without allowing archived drag updates", () => {
  assert.match(manager, /Active tasks/);
  assert.match(manager, /Archived tasks/);
  assert.match(manager, /archived: !restoring/);
  assert.match(manager, /Restore task/);
  assert.match(manager, /Archive task/);
  assert.match(manager, /draggable=\{!archived\}/);
  assert.match(manager, /This task is read-only and hidden from employee work queues/);
});
