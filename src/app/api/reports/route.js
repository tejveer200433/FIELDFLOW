import { ApiError, apiFailure, assertUserInScope, notifyEvent, requireAnyPermission, requirePermission, resolveUserScope } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
const reportSelect = "*,profiles!daily_reports_employee_id_fkey(full_name)";
const map = row => ({ id: row.id, employeeId: row.employee_id, employee: row.profiles?.full_name || "Employee", date: row.report_date, hours: String(row.hours), task: row.task_title, taskId: row.task_id, workCompleted: row.work_completed, problems: row.problems || "None", tomorrowPlan: row.tomorrow_plan || "Not specified", status: row.status, managerComment: row.manager_comment || "" });

export async function GET(request) {
  try {
    const session = await requireAnyPermission(request, ["reports.submit", "reports.review"]);
    const scope = await resolveUserScope(session, {
      self: "reports.submit",
      team: "reports.review",
      all: session.access.isOwner || session.access.permissions.includes("employees.view_all") ? "reports.review" : null
    });
    let query = session.client.from("daily_reports").select(reportSelect).order("created_at", { ascending: false });
    if (scope.type !== "all") query = query.in("employee_id", scope.userIds);
    const requested = new URL(request.url).searchParams.get("employeeId");
    if (requested) {
      assertUserInScope(scope, requested);
      query = query.eq("employee_id", requested);
    }
    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ data: data.map(map) });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request) {
  try {
    const { client, profile } = await requirePermission(request, "reports.submit");
    const body = await request.json();
    if (!body.task || !body.workCompleted || !Number(body.hours)) throw new ApiError("Task, completed work and hours are required.");
    const { data, error } = await client.from("daily_reports").insert({
      employee_id: profile.id,
      task_id: body.taskId || null,
      task_title: String(body.task).slice(0, 160),
      hours: Number(body.hours),
      work_completed: String(body.workCompleted).slice(0, 5000),
      problems: String(body.problems || "").slice(0, 2000) || null,
      tomorrow_plan: String(body.tomorrowPlan || "").slice(0, 2000) || null
    }).select(reportSelect).single();
    if (error) throw error;
    const mapped = map(data);
    await notifyEvent(client, {
      employeeId: profile.id,
      permissionKey: "reports.review",
      type: "report_submitted",
      title: "Daily report submitted for review",
      body: `${mapped.employee} submitted a daily report for ${mapped.date}.`,
      entityType: "daily_report",
      entityId: mapped.id
    });
    return Response.json({ data: mapped }, { status: 201 });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request) {
  try {
    const session = await requirePermission(request, "reports.review");
    const body = await request.json();
    if (!body.id || !["Approved", "Rejected", "Needs Update"].includes(body.status)) throw new ApiError("A report and valid decision are required.");
    const { data: report, error: findError } = await session.client.from("daily_reports").select("id,employee_id").eq("id", body.id).single();
    if (findError || !report) throw new ApiError("Report not found in your permitted scope.", 404);
    const scope = session.access.isOwner || session.access.permissions.includes("employees.view_all")
      ? { type: "all", userIds: null }
      : await resolveUserScope(session, { team: "reports.review" });
    assertUserInScope(scope, report.employee_id);
    const { data, error } = await session.client.from("daily_reports").update({
      status: body.status,
      manager_comment: String(body.managerComment || "").slice(0, 500),
      reviewed_by: session.profile.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", body.id).select(reportSelect).single();
    if (error) throw error;
    return Response.json({ data: map(data) });
  } catch (error) {
    return apiFailure(error);
  }
}
