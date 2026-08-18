import { ApiError, apiFailure, assertUserInScope, notifyEvent, requireAnyPermission, requirePermission, resolveUserScope } from "@/backend/supabase/supabaseServer";

export const dynamic = "force-dynamic";
const reportSelect = "*,profiles!daily_reports_employee_id_fkey(full_name)";
const map = row => ({ id: row.id, employeeId: row.employee_id, employee: row.profiles?.full_name || "Employee", date: row.report_date, hours: String(row.hours), task: row.task_title, taskId: row.task_id, workCompleted: row.work_completed, problems: row.problems || "None", tomorrowPlan: row.tomorrow_plan || "Not specified", status: row.status, managerComment: row.manager_comment || "" });
const reportStatuses = ["Submitted", "Approved", "Rejected", "Needs Update"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function optionalUuid(value, name) {
  if (!value) return null;
  if (!uuidPattern.test(value)) throw new ApiError(`${name} must be a valid identifier.`);
  return value;
}

function optionalDate(value, name) {
  if (!value) return null;
  if (!datePattern.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new ApiError(`${name} must use YYYY-MM-DD format.`);
  }
  return value;
}

function summarize(rows) {
  return rows.reduce((summary, row) => {
    summary.totalReports += 1;
    summary.totalHours += Number(row.hours) || 0;
    if (row.status === "Submitted") summary.submitted += 1;
    if (row.status === "Approved") summary.approved += 1;
    if (row.status === "Needs Update") summary.needsUpdate += 1;
    if (row.status === "Rejected") summary.rejected += 1;
    return summary;
  }, { totalReports: 0, totalHours: 0, submitted: 0, approved: 0, needsUpdate: 0, rejected: 0 });
}

function csvCell(value) {
  let text = String(value ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function reportCsv(rows) {
  const headers = ["Date", "Employee", "Hours", "Task", "Status", "Work completed", "Problems", "Tomorrow plan", "Manager comment"];
  const body = rows.map(row => [row.date, row.employee, row.hours, row.task, row.status, row.workCompleted, row.problems, row.tomorrowPlan, row.managerComment].map(csvCell).join(","));
  return `\uFEFF${[headers.map(csvCell).join(","), ...body].join("\r\n")}`;
}

export async function GET(request) {
  try {
    const session = await requireAnyPermission(request, ["reports.submit", "reports.review"]);
    const scope = await resolveUserScope(session, {
      self: "reports.submit",
      team: "reports.review",
      all: session.access.isOwner || session.access.permissions.includes("employees.view_all") ? "reports.review" : null
    });
    const params = new URL(request.url).searchParams;
    const employeeId = optionalUuid(params.get("employeeId"), "Employee");
    const teamId = optionalUuid(params.get("teamId"), "Team");
    const taskId = optionalUuid(params.get("taskId"), "Task");
    const from = optionalDate(params.get("from"), "Start date");
    const to = optionalDate(params.get("to"), "End date");
    const status = params.get("status") || "";
    const format = params.get("format") || "";
    const limit = Math.min(100, Math.max(1, Math.trunc(Number(params.get("limit"))) || 50));
    const offset = Math.max(0, Math.trunc(Number(params.get("offset"))) || 0);
    if (status && !reportStatuses.includes(status)) throw new ApiError("Invalid report status.");
    if (format && format !== "csv") throw new ApiError("Unsupported report format.");
    if (from && to && from > to) throw new ApiError("Start date cannot be after end date.");

    let scopedUserIds = scope.userIds;
    if (teamId) {
      const { data: memberships, error: membershipError } = await session.client
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId);
      if (membershipError) throw membershipError;
      const teamUserIds = (memberships || []).map(item => item.user_id);
      scopedUserIds = scope.type === "all"
        ? teamUserIds
        : teamUserIds.filter(userId => scope.userIds.includes(userId));
    }
    if (employeeId) {
      assertUserInScope(scope, employeeId);
      if (teamId && !scopedUserIds.includes(employeeId)) {
        if (format === "csv") return new Response(reportCsv([]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=fieldflow-reports.csv" } });
        return Response.json({ data: [], summary: summarize([]), pagination: { limit, offset, hasMore: false } });
      }
      scopedUserIds = [employeeId];
    }
    if (scope.type !== "all" || teamId || employeeId) {
      if (!scopedUserIds?.length) {
        if (format === "csv") return new Response(reportCsv([]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=fieldflow-reports.csv" } });
        return Response.json({ data: [], summary: summarize([]), pagination: { limit, offset, hasMore: false } });
      }
    }

    let query = session.client.from("daily_reports").select(reportSelect).order("created_at", { ascending: false });
    if (scope.type !== "all" || teamId || employeeId) query = query.in("employee_id", scopedUserIds);
    if (taskId) query = query.eq("task_id", taskId);
    if (status) query = query.eq("status", status);
    if (from) query = query.gte("report_date", from);
    if (to) query = query.lte("report_date", to);
    query = format === "csv" ? query.limit(5000) : query.range(offset, offset + limit);
    const { data, error } = await query;
    if (error) throw error;
    const mapped = data.map(map);
    if (format === "csv") {
      return new Response(reportCsv(mapped), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=fieldflow-reports.csv",
          "Cache-Control": "no-store"
        }
      });
    }
    const hasMore = data.length > limit;
    const { data: aggregate, error: aggregateError } = await session.client.rpc("daily_report_summary", {
      p_employee_ids: scope.type !== "all" || teamId || employeeId ? scopedUserIds : null,
      p_task_id: taskId,
      p_status: status || null,
      p_from: from,
      p_to: to
    });
    const page = mapped.slice(0, limit);
    return Response.json({ data: page, summary: aggregateError ? summarize(page) : aggregate, pagination: { limit, offset, hasMore } });
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
