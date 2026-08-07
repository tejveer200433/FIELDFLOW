import {
  ApiError,
  apiFailure,
  assertUserInScope,
  notifyEvent,
  requireAnyPermission,
  resolveUserScope
} from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const taskSelect = "*";

async function getEmployeeNames(client, rows) {
  const employeeIds = [...new Set(rows.map(row => row.employee_id).filter(Boolean))];
  if (!employeeIds.length) return new Map();
  const { data, error } = await client.from("profiles").select("id,full_name").in("id", employeeIds);
  if (error) throw error;
  return new Map(data.map(profile => [profile.id, profile.full_name]));
}

const map = (row, employeeNames = new Map()) => ({
  id: row.id,
  title: row.title,
  employeeId: row.employee_id,
  employee: employeeNames.get(row.employee_id) || "Unassigned",
  client: row.client,
  address: row.address,
  priority: row.priority,
  status: row.status,
  scheduledAt: row.scheduled_at,
  description: row.description,
  updatedAt: row.updated_at
});

export async function GET(request) {
  try {
    const session = await requireAnyPermission(request, ["tasks.view_self", "tasks.assign", "tasks.manage_all"]);
    const scope = await resolveUserScope(session, {
      self: "tasks.view_self",
      team: "tasks.assign",
      all: "tasks.manage_all"
    });
    let query = session.client.from("tasks").select(taskSelect).order("created_at", { ascending: false });
    if (scope.type !== "all") query = query.in("employee_id", scope.userIds);
    const { data, error } = await query;
    if (error) throw error;
    const employeeNames = await getEmployeeNames(session.client, data);
    return Response.json({ data: data.map(row => map(row, employeeNames)) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request) {
  try {
    const session = await requireAnyPermission(request, ["tasks.assign", "tasks.manage_all"]);
    const body = await request.json();
    if (!body.title || !body.employeeId || !body.client || !body.address) {
      throw new ApiError("Title, employee, client and address are required.");
    }
    const scope = await resolveUserScope(session, { team: "tasks.assign", all: "tasks.manage_all" });
    assertUserInScope(scope, body.employeeId);
    const { data, error } = await session.client.from("tasks").insert({
      title: String(body.title).slice(0, 160),
      employee_id: body.employeeId,
      created_by: session.profile.id,
      client: String(body.client).slice(0, 160),
      address: String(body.address).slice(0, 500),
      priority: body.priority || "Medium",
      status: "Assigned",
      scheduled_at: body.scheduledAt || null,
      description: String(body.description || "").slice(0, 3000) || null
    }).select(taskSelect).single();
    if (error) throw error;
    const employeeNames = await getEmployeeNames(session.client, [data]);
    return Response.json({ data: map(data, employeeNames) }, { status: 201 });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request) {
  try {
    const session = await requireAnyPermission(request, ["tasks.view_self", "tasks.assign", "tasks.manage_all"]);
    const body = await request.json();
    if (!body.id || !["Assigned", "On The Way", "In Progress", "Completed", "Blocked"].includes(body.status)) {
      throw new ApiError("A task and valid status are required.");
    }
    const { data: task, error: taskError } = await session.client.from("tasks").select("id,employee_id").eq("id", body.id).single();
    if (taskError || !task) throw new ApiError("Task not found in your permitted scope.", 404);

    let error;
    if (task.employee_id === session.profile.id && session.access.permissions.includes("tasks.view_self")) {
      ({ error } = await session.client.rpc("update_my_task_status", { p_task_id: body.id, p_status: body.status }));
    } else {
      const scope = await resolveUserScope(session, { team: "tasks.assign", all: "tasks.manage_all" });
      assertUserInScope(scope, task.employee_id);
      ({ error } = await session.client.from("tasks").update({ status: body.status, updated_at: new Date().toISOString() }).eq("id", body.id));
    }
    if (error) throw error;
    const { data, error: readError } = await session.client.from("tasks").select(taskSelect).eq("id", body.id).single();
    if (readError) throw readError;
    const employeeNames = await getEmployeeNames(session.client, [data]);
    if (body.status === "Completed") {
      await notifyEvent(session.client, {
        employeeId: task.employee_id,
        permissionKey: "tasks.assign",
        type: "task_completed",
        title: "Field task completed",
        body: `${employeeNames.get(task.employee_id) || "An employee"} marked "${data.title}" as completed.`,
        entityType: "task",
        entityId: data.id
      });
    }
    return Response.json({ data: map(data, employeeNames) });
  } catch (error) {
    return apiFailure(error);
  }
}
