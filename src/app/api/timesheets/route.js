import { ApiError, apiFailure, assertUserInScope, requireAnyPermission, resolveUserScope } from "@/backend/supabase/supabaseServer";

export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EXPORT_DAYS = 366;
const MAX_EXPORT_ROWS = 5000;

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

function defaultRange(requestedFrom, requestedTo) {
  const today = new Date().toISOString().slice(0, 10);
  const to = requestedTo || today;
  const fromDate = new Date(`${to}T00:00:00Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - 30);
  return { from: requestedFrom || fromDate.toISOString().slice(0, 10), to };
}

function csvCell(value) {
  let text = String(value ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function hours(minutes) {
  return (Math.max(0, Number(minutes) || 0) / 60).toFixed(2);
}

function timesheetCsv(rows, profileById, templateById) {
  const headers = [
    "Employee", "Work date", "Shift", "Scheduled start", "Scheduled end",
    "Check in", "Check out", "Regular hours", "Overtime hours", "Break hours",
    "Total worked hours", "Attendance status", "Time zone"
  ];
  const body = rows.map(row => {
    const workedMinutes = Math.max(0, Number(row.worked_minutes) || 0);
    const overtimeMinutes = Math.max(0, Number(row.overtime_minutes) || 0);
    return [
      profileById.get(row.employee_id)?.full_name || "Employee",
      row.work_date,
      templateById.get(row.shift_template_id)?.name || "",
      row.scheduled_start_at,
      row.scheduled_end_at,
      row.check_in_at,
      row.check_out_at,
      hours(Math.max(0, workedMinutes - overtimeMinutes)),
      hours(overtimeMinutes),
      hours(row.break_minutes),
      hours(workedMinutes),
      row.attendance_status,
      row.time_zone
    ].map(csvCell).join(",");
  });
  return `\uFEFF${[headers.map(csvCell).join(","), ...body].join("\r\n")}`;
}

export async function GET(request) {
  try {
    const session = await requireAnyPermission(request, ["attendance.view_team", "attendance.view_all"]);
    const scope = await resolveUserScope(session, { team: "attendance.view_team", all: "attendance.view_all" });
    const params = new URL(request.url).searchParams;
    const employeeId = optionalUuid(params.get("employeeId"), "Employee");
    const teamId = optionalUuid(params.get("teamId"), "Team");
    const requestedFrom = optionalDate(params.get("from"), "Start date");
    const requestedTo = optionalDate(params.get("to"), "End date");
    const { from, to } = defaultRange(requestedFrom, requestedTo);
    if (from > to) throw new ApiError("Start date cannot be after end date.");
    if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 > MAX_EXPORT_DAYS) {
      throw new ApiError("Payroll exports are limited to 366 days.");
    }

    let scopedUserIds = scope.userIds;
    if (teamId) {
      const { data: memberships, error } = await session.client.from("team_members").select("user_id").eq("team_id", teamId);
      if (error) throw error;
      const teamUserIds = (memberships || []).map(item => item.user_id);
      scopedUserIds = scope.type === "all" ? teamUserIds : teamUserIds.filter(id => scope.userIds.includes(id));
    }
    if (employeeId) {
      assertUserInScope(scope, employeeId);
      scopedUserIds = teamId && !scopedUserIds.includes(employeeId) ? [] : [employeeId];
    }

    if ((scope.type !== "all" || teamId || employeeId) && !scopedUserIds?.length) {
      return new Response(timesheetCsv([], new Map(), new Map()), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=fieldflow-payroll-${from}-to-${to}.csv`,
          "Cache-Control": "no-store"
        }
      });
    }

    let query = session.client
      .from("attendance_shifts")
      .select("employee_id,work_date,shift_template_id,scheduled_start_at,scheduled_end_at,check_in_at,check_out_at,break_minutes,worked_minutes,overtime_minutes,attendance_status,time_zone")
      .gte("work_date", from)
      .lte("work_date", to)
      .order("work_date", { ascending: true })
      .limit(MAX_EXPORT_ROWS);
    if (scope.type !== "all" || teamId || employeeId) query = query.in("employee_id", scopedUserIds);
    const { data: rows, error } = await query;
    if (error) throw error;

    const employeeIds = [...new Set((rows || []).map(row => row.employee_id).filter(Boolean))];
    const templateIds = [...new Set((rows || []).map(row => row.shift_template_id).filter(Boolean))];
    const [profilesResult, templatesResult] = await Promise.all([
      employeeIds.length ? session.client.from("profiles").select("id,full_name").in("id", employeeIds) : Promise.resolve({ data: [], error: null }),
      templateIds.length ? session.client.from("attendance_shift_templates").select("id,name").in("id", templateIds) : Promise.resolve({ data: [], error: null })
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (templatesResult.error) throw templatesResult.error;
    const csv = timesheetCsv(
      rows || [],
      new Map((profilesResult.data || []).map(profile => [profile.id, profile])),
      new Map((templatesResult.data || []).map(template => [template.id, template]))
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=fieldflow-payroll-${from}-to-${to}.csv`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return apiFailure(error);
  }
}
