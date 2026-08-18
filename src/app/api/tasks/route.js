import {
  ApiError,
  apiFailure,
  assertUserInScope,
  notifyEvent,
  requireAnyPermission,
  resolveUserScope
} from "@/backend/supabase/supabaseServer";

export const dynamic = "force-dynamic";

const taskSelect = "*";

async function getAssignees(client, rows) {
  const taskIds = rows.map(row => row.id);
  if (!taskIds.length) return { employeeNames: new Map(), taskAssignees: new Map() };
  const { data: assignments, error: assignmentError } = await client
    .from("task_assignees").select("task_id,employee_id,created_at").in("task_id", taskIds)
    .order("created_at", { ascending: true });
  const safeAssignments = assignmentError
    ? rows.filter(row => row.employee_id).map(row => ({ task_id: row.id, employee_id: row.employee_id }))
    : assignments;
  const employeeIds = [...new Set(safeAssignments.map(row => row.employee_id).filter(Boolean))];
  const taskAssignees = new Map();
  for (const assignment of safeAssignments) {
    const current = taskAssignees.get(assignment.task_id) || [];
    current.push(assignment.employee_id);
    taskAssignees.set(assignment.task_id, current);
  }
  if (!employeeIds.length) return { employeeNames: new Map(), taskAssignees };
  const { data, error } = await client.from("profiles").select("id,full_name").in("id", employeeIds);
  if (error) throw error;
  return { employeeNames: new Map(data.map(profile => [profile.id, profile.full_name])), taskAssignees };
}

const map = (row, employeeNames = new Map(), trackedSeconds = new Map(), taskAssignees = new Map()) => {
  const employeeIds = taskAssignees.get(row.id) || (row.employee_id ? [row.employee_id] : []);
  const assignees = employeeIds.map(id => ({ id, name: employeeNames.get(id) || "Assigned employee" }));
  return ({
  id: row.id,
  title: row.title,
  employeeId: row.employee_id,
  employee: assignees.map(item => item.name).join(", ") || "Unassigned",
  employeeIds,
  assignees,
  client: row.client,
  address: row.address,
  priority: row.priority,
  status: row.status,
  scheduledAt: row.scheduled_at,
  description: row.description,
  checklist: Array.isArray(row.checklist) ? row.checklist : [],
  estimatedMinutes: row.estimated_minutes,
  actualMinutes: Math.round((trackedSeconds.get(row.id) || 0) / 60),
  recurrence: row.recurrence || "none",
  archived: Boolean(row.archived_at),
  archivedAt: row.archived_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
  });
};
const taskStatuses = ["Assigned", "On The Way", "In Progress", "Completed", "Blocked"];
const taskPriorities = ["Low", "Medium", "High", "Urgent"];
const editableTaskFields = ["title", "client", "address", "priority", "scheduledAt", "description", "checklist", "estimatedMinutes", "recurrence", "employeeIds"];
const recurrenceValues = ["none", "daily", "weekly", "monthly"];

function checklist(value) {
  if (!Array.isArray(value) || value.length > 100) throw new ApiError("Checklist must contain at most 100 items.");
  return value.map((item, index) => {
    const text = String(typeof item === "string" ? item : item?.text || "").trim().slice(0, 300);
    if (!text) throw new ApiError("Checklist items cannot be empty.");
    return { id: String(item?.id || crypto.randomUUID()), text, completed: Boolean(item?.completed), sortOrder: index };
  });
}

async function getTrackedSeconds(client, taskIds) {
  if (!taskIds.length) return new Map();
  const { data, error } = await client.rpc("task_tracked_seconds", { p_task_ids: taskIds });
  if (error) return new Map();
  return new Map((data || []).map(item => [item.task_id, Number(item.tracked_seconds) || 0]));
}

export async function GET(request) {
  try {
    const session = await requireAnyPermission(request, ["tasks.view_self", "tasks.assign", "tasks.manage_all"]);
    const scope = await resolveUserScope(session, {
      self: "tasks.view_self",
      team: "tasks.assign",
      all: "tasks.manage_all"
    });
    const view = new URL(request.url).searchParams.get("view") || "active";
    if (!["active", "archived", "all"].includes(view)) throw new ApiError("Task view must be active, archived or all.");
    const canManage = Boolean(session.access.isOwner || session.access.permissions.includes("tasks.assign") || session.access.permissions.includes("tasks.manage_all"));
    if (view !== "active" && !canManage) throw new ApiError("You do not have permission to view archived tasks.", 403);
    let query = session.client.from("tasks").select(taskSelect).order("created_at", { ascending: false });
    if (view === "active") query = query.is("archived_at", null);
    if (view === "archived") query = query.not("archived_at", "is", null);
    const { data, error } = await query;
    if (error) throw error;
    const { employeeNames, taskAssignees } = await getAssignees(session.client, data);
    const visible = scope.type === "all" ? data : data.filter(row =>
      (taskAssignees.get(row.id) || [row.employee_id]).some(employeeId => scope.userIds.includes(employeeId))
    );
    const trackedSeconds = await getTrackedSeconds(session.client, visible.map(row => row.id));
    return Response.json({ data: visible.map(row => map(row, employeeNames, trackedSeconds, taskAssignees)) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request) {
  try {
    const session = await requireAnyPermission(request, ["tasks.assign", "tasks.manage_all"]);
    const body = await request.json();
    const employeeIds = [...new Set((Array.isArray(body.employeeIds) ? body.employeeIds : [body.employeeId]).filter(Boolean).map(String))];
    if (!body.title || !employeeIds.length || !body.client || !body.address) {
      throw new ApiError("Title, employee, client and address are required.");
    }
    if (body.priority && !taskPriorities.includes(body.priority)) throw new ApiError("Invalid task priority.");
    if (body.scheduledAt && Number.isNaN(Date.parse(body.scheduledAt))) throw new ApiError("Invalid scheduled date.");
    if (body.recurrence && !recurrenceValues.includes(body.recurrence)) throw new ApiError("Invalid recurrence.");
    if (body.estimatedMinutes && (!Number.isInteger(Number(body.estimatedMinutes)) || Number(body.estimatedMinutes) < 1 || Number(body.estimatedMinutes) > 100800)) throw new ApiError("Estimated minutes must be between 1 and 100800.");
    const scope = await resolveUserScope(session, { team: "tasks.assign", all: "tasks.manage_all" });
    employeeIds.forEach(employeeId => assertUserInScope(scope, employeeId));
    const { data, error } = await session.client.from("tasks").insert({
      title: String(body.title).slice(0, 160),
      employee_id: employeeIds[0],
      created_by: session.profile.id,
      client: String(body.client).slice(0, 160),
      address: String(body.address).slice(0, 500),
      priority: body.priority || "Medium",
      status: "Assigned",
      scheduled_at: body.scheduledAt || null,
      description: String(body.description || "").slice(0, 3000) || null,
      checklist: body.checklist ? checklist(body.checklist) : [],
      estimated_minutes: body.estimatedMinutes ? Number(body.estimatedMinutes) : null,
      recurrence: body.recurrence || "none"
    }).select(taskSelect).single();
    if (error) throw error;
    if (employeeIds.length > 1) {
      const { error: assigneeError } = await session.client.rpc("set_task_assignees", { p_task_id: data.id, p_employee_ids: employeeIds });
      if (assigneeError) throw assigneeError;
    }
    const { employeeNames, taskAssignees } = await getAssignees(session.client, [data]);
    return Response.json({ data: map(data, employeeNames, new Map(), taskAssignees) }, { status: 201 });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request) {
  try {
    const session = await requireAnyPermission(request, ["tasks.view_self", "tasks.assign", "tasks.manage_all"]);
    const body = await request.json();
    const archiveRequested = Object.prototype.hasOwnProperty.call(body, "archived");
    const checklistOnlyRequested = Object.prototype.hasOwnProperty.call(body, "completedChecklistIds")
      && !editableTaskFields.some(field => Object.prototype.hasOwnProperty.call(body, field))
      && !Object.prototype.hasOwnProperty.call(body, "status")
      && !archiveRequested;
    const detailRequested = editableTaskFields.some(field => Object.prototype.hasOwnProperty.call(body, field));
    const statusRequested = Object.prototype.hasOwnProperty.call(body, "status");
    if (!body.id || (!detailRequested && !statusRequested && !checklistOnlyRequested && !archiveRequested)) throw new ApiError("A task update is required.");
    if (archiveRequested && typeof body.archived !== "boolean") throw new ApiError("Archived must be true or false.");
    if (statusRequested && !taskStatuses.includes(body.status)) throw new ApiError("A valid task status is required.");
    const { data: task, error: taskError } = await session.client.from("tasks").select("id,employee_id,archived_at").eq("id", body.id).single();
    if (taskError || !task) throw new ApiError("Task not found in your permitted scope.", 404);
    if (task.archived_at && !archiveRequested) throw new ApiError("Restore this task before changing it.", 409);
    const { taskAssignees: currentAssignments } = await getAssignees(session.client, [task]);
    const currentEmployeeIds = currentAssignments.get(task.id) || [task.employee_id];
    const isAssignedEmployee = currentEmployeeIds.includes(session.profile.id);

    let error;
    if (checklistOnlyRequested && isAssignedEmployee && session.access.permissions.includes("tasks.view_self")) {
      if (!Array.isArray(body.completedChecklistIds) || body.completedChecklistIds.length > 100) throw new ApiError("Invalid checklist update.");
      ({ error } = await session.client.rpc("update_my_task_checklist", { p_task_id: body.id, p_completed_ids: body.completedChecklistIds.map(String) }));
    } else if (!detailRequested && statusRequested && !archiveRequested && isAssignedEmployee && session.access.permissions.includes("tasks.view_self")) {
      ({ error } = await session.client.rpc("update_my_task_status", { p_task_id: body.id, p_status: body.status }));
    } else {
      const scope = await resolveUserScope(session, { team: "tasks.assign", all: "tasks.manage_all" });
      assertUserInScope(scope, task.employee_id);
      let requestedEmployeeIds = null;
      if (Object.prototype.hasOwnProperty.call(body, "employeeIds")) {
        if (!Array.isArray(body.employeeIds)) throw new ApiError("Assignees must be a list.");
        requestedEmployeeIds = [...new Set(body.employeeIds.filter(Boolean).map(String))];
        if (!requestedEmployeeIds.length || requestedEmployeeIds.length > 25) throw new ApiError("Select between 1 and 25 assignees.");
        requestedEmployeeIds.forEach(employeeId => assertUserInScope(scope, employeeId));
      }
      const update = { updated_at: new Date().toISOString() };
      if (archiveRequested) {
        update.archived_at = body.archived ? new Date().toISOString() : null;
        update.archived_by = body.archived ? session.profile.id : null;
      }
      if (statusRequested) update.status = body.status;
      if (Object.prototype.hasOwnProperty.call(body, "title")) {
        if (!String(body.title || "").trim()) throw new ApiError("Task title is required.");
        update.title = String(body.title).trim().slice(0, 160);
      }
      if (Object.prototype.hasOwnProperty.call(body, "client")) {
        if (!String(body.client || "").trim()) throw new ApiError("Client is required.");
        update.client = String(body.client).trim().slice(0, 160);
      }
      if (Object.prototype.hasOwnProperty.call(body, "address")) {
        if (!String(body.address || "").trim()) throw new ApiError("Site/address is required.");
        update.address = String(body.address).trim().slice(0, 500);
      }
      if (Object.prototype.hasOwnProperty.call(body, "priority")) {
        if (!taskPriorities.includes(body.priority)) throw new ApiError("Invalid task priority.");
        update.priority = body.priority;
      }
      if (Object.prototype.hasOwnProperty.call(body, "scheduledAt")) {
        if (body.scheduledAt && Number.isNaN(Date.parse(body.scheduledAt))) throw new ApiError("Invalid scheduled date.");
        update.scheduled_at = body.scheduledAt || null;
      }
      if (Object.prototype.hasOwnProperty.call(body, "description")) {
        update.description = String(body.description || "").trim().slice(0, 3000) || null;
      }
      if (Object.prototype.hasOwnProperty.call(body, "checklist")) update.checklist = checklist(body.checklist);
      if (Object.prototype.hasOwnProperty.call(body, "estimatedMinutes")) {
        if (body.estimatedMinutes && (!Number.isInteger(Number(body.estimatedMinutes)) || Number(body.estimatedMinutes) < 1 || Number(body.estimatedMinutes) > 100800)) throw new ApiError("Estimated minutes must be between 1 and 100800.");
        update.estimated_minutes = body.estimatedMinutes ? Number(body.estimatedMinutes) : null;
      }
      if (Object.prototype.hasOwnProperty.call(body, "recurrence")) {
        if (!recurrenceValues.includes(body.recurrence)) throw new ApiError("Invalid recurrence.");
        update.recurrence = body.recurrence;
      }
      ({ error } = await session.client.from("tasks").update(update).eq("id", body.id));
      if (!error && requestedEmployeeIds) {
        ({ error } = await session.client.rpc("set_task_assignees", { p_task_id: body.id, p_employee_ids: requestedEmployeeIds }));
      }
    }
    if (error) throw error;
    const { data, error: readError } = await session.client.from("tasks").select(taskSelect).eq("id", body.id).single();
    if (readError) throw readError;
    const { employeeNames, taskAssignees } = await getAssignees(session.client, [data]);
    if (statusRequested && body.status === "Completed") {
      await notifyEvent(session.client, {
        employeeId: task.employee_id,
        permissionKey: "tasks.assign",
        type: "task_completed",
        title: "Field task completed",
        body: `${employeeNames.get(task.employee_id) || "An employee"} marked "${data.title}" as completed.`,
        entityType: "task",
        entityId: data.id
      });
      await session.client.rpc("create_next_recurring_task", { p_task_id: body.id });
    }
    const trackedSeconds = await getTrackedSeconds(session.client, [data.id]);
    return Response.json({ data: map(data, employeeNames, trackedSeconds, taskAssignees) });
  } catch (error) {
    return apiFailure(error);
  }
}
