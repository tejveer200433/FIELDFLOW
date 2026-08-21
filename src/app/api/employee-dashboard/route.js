import { apiFailure, requirePermission } from "@/backend/supabase/supabaseServer";
import { hasPermission, PERMISSIONS } from "@/shared/permissions";

export const dynamic = "force-dynamic";

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const taskSelect = "id,title,client,address,priority,status,scheduled_at,description,created_at,updated_at,employee_id,archived_at";

function validDay(value) {
  if (!dayPattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function sectionError(name, result, errors) {
  if (result.status === "fulfilled") return result.value;
  errors.push(name);
  return null;
}

async function attendanceSection(client, employeeId, day) {
  const [dayYear, dayMonth, dayDate] = day.split("-").map(Number);
  const requestedDay = new Date(dayYear, dayMonth - 1, dayDate, 12);
  const weekdayOffset = requestedDay.getDay() === 0 ? 6 : requestedDay.getDay() - 1;
  requestedDay.setDate(requestedDay.getDate() - weekdayOffset);
  const weekStart = `${requestedDay.getFullYear()}-${String(requestedDay.getMonth() + 1).padStart(2, "0")}-${String(requestedDay.getDate()).padStart(2, "0")}`;
  const [attendanceResult, scheduleResult, rosterResult] = await Promise.all([
    client.from("attendance_shifts")
      .select("id,work_date,check_in_at,check_out_at,time_zone,attendance_status,shift_template_id,check_in_location_id,break_minutes,worked_minutes,scheduled_start_at,scheduled_end_at,overtime_minutes,checkout_source")
      .eq("employee_id", employeeId)
      .or(`work_date.gte.${weekStart},check_out_at.is.null`)
      .lte("work_date", day)
      .order("check_in_at", { ascending: false })
      .limit(20),
    client.from("employee_attendance_schedules")
      .select("id,shift_template_id,effective_from,effective_to,weekdays")
      .eq("employee_id", employeeId)
      .lte("effective_from", day)
      .or(`effective_to.is.null,effective_to.gte.${day}`)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client.from("attendance_rosters")
      .select("id,shift_template_id,work_date,notes")
      .eq("employee_id", employeeId)
      .eq("work_date", day)
      .maybeSingle()
  ]);
  const firstFailure = [attendanceResult, scheduleResult, rosterResult].find(result => result.error);
  if (firstFailure) throw firstFailure.error;
  const attendance = attendanceResult.data;
  const assignment = rosterResult.data || scheduleResult.data;

  const shiftIds = attendance.map(item => item.id);
  const templateIds = [...new Set([...attendance.map(item => item.shift_template_id), assignment?.shift_template_id].filter(Boolean))];
  const locationIds = [...new Set(attendance.map(item => item.check_in_location_id).filter(Boolean))];
  const [breakResult, templateResult, locationResult] = await Promise.all([
    shiftIds.length ? client
      .from("attendance_breaks")
      .select("id,shift_id,started_at,ended_at,break_type")
      .in("shift_id", shiftIds)
      .order("started_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    templateIds.length ? client.from("attendance_shift_templates").select("id,name,start_time,end_time,unpaid_break_minutes,grace_minutes,auto_checkout_after_minutes,weekly_off_days").in("id", templateIds) : Promise.resolve({ data: [], error: null }),
    locationIds.length ? client.from("attendance_locations").select("id,name").in("id", locationIds) : Promise.resolve({ data: [], error: null })
  ]);
  const failed = [breakResult, templateResult, locationResult].find(result => result.error);
  if (failed) throw failed.error;
  const templates = new Map(templateResult.data.map(item => [item.id, item]));
  const locationNames = new Map(locationResult.data.map(item => [item.id, item.name]));
  const planTemplate = templates.get(assignment?.shift_template_id) || null;
  const [year, month, date] = day.split("-").map(Number);
  const weekday = new Date(year, month - 1, date, 12).getDay();
  const weeklyOff = !rosterResult.data && Boolean(scheduleResult.data) && (
    !scheduleResult.data.weekdays.includes(weekday) || planTemplate?.weekly_off_days?.includes(weekday)
  );

  return {
    attendance: attendance.map(row => ({
      id: row.id,
      date: row.work_date,
      checkInAt: row.check_in_at,
      checkOutAt: row.check_out_at,
      timeZone: row.time_zone,
      status: row.attendance_status,
      shiftTemplateId: row.shift_template_id,
      shiftName: templates.get(row.shift_template_id)?.name || null,
      checkInLocation: { geofenceName: locationNames.get(row.check_in_location_id) || null },
      breakMinutes: Number(row.break_minutes) || 0,
      workedMinutes: Number(row.worked_minutes) || 0,
      scheduledStartAt: row.scheduled_start_at,
      scheduledEndAt: row.scheduled_end_at,
      overtimeMinutes: Number(row.overtime_minutes) || 0,
      checkoutSource: row.checkout_source || "manual"
    })),
    breaks: breakResult.data.map(row => ({ id: row.id, shiftId: row.shift_id, startedAt: row.started_at, endedAt: row.ended_at, breakType: row.break_type || "unpaid" })),
    plan: assignment && planTemplate ? {
      shiftTemplateId: planTemplate.id,
      shiftName: planTemplate.name,
      startTime: planTemplate.start_time,
      endTime: planTemplate.end_time,
      unpaidBreakMinutes: Number(planTemplate.unpaid_break_minutes) || 0,
      graceMinutes: Number(planTemplate.grace_minutes) || 0,
      autoCheckoutAfterMinutes: Number(planTemplate.auto_checkout_after_minutes) || 0,
      weeklyOff,
      rosterOverride: Boolean(rosterResult.data)
    } : null
  };
}

async function taskSection(client, employeeId) {
  const [taskResult, assignmentResult] = await Promise.all([
    client.from("tasks").select(taskSelect).is("archived_at", null).order("created_at", { ascending: false }),
    client.from("task_assignees").select("task_id").eq("employee_id", employeeId)
  ]);
  if (taskResult.error) throw taskResult.error;
  if (assignmentResult.error) throw assignmentResult.error;
  const assignedIds = new Set((assignmentResult.data || []).map(item => item.task_id));
  return taskResult.data
    .filter(row => row.employee_id === employeeId || assignedIds.has(row.id))
    .map(row => ({
      id: row.id,
      title: row.title,
      client: row.client,
      address: row.address,
      priority: row.priority,
      status: row.status,
      scheduledAt: row.scheduled_at,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
}

async function reportSection(client, employeeId, day) {
  const { data, error } = await client.from("daily_reports")
    .select("status")
    .eq("employee_id", employeeId)
    .eq("report_date", day)
    .limit(100);
  if (error) throw error;
  return {
    totalReports: data.length,
    approved: data.filter(item => item.status === "Approved").length,
    submitted: data.filter(item => item.status === "Submitted").length,
    needsUpdate: data.filter(item => item.status === "Needs Update").length,
    rejected: data.filter(item => item.status === "Rejected").length
  };
}

export async function GET(request) {
  try {
    const session = await requirePermission(request, PERMISSIONS.dashboardView);
    const day = new URL(request.url).searchParams.get("day") || "";
    if (!validDay(day)) {
      return Response.json({ error: "A valid local dashboard day is required." }, { status: 400 });
    }

    const attendancePromise = hasPermission(session.access, PERMISSIONS.attendanceViewSelf)
      ? attendanceSection(session.client, session.profile.id, day)
      : Promise.resolve({ attendance: [], breaks: [], plan: null });
    const taskPromise = hasPermission(session.access, PERMISSIONS.tasksViewSelf)
      ? taskSection(session.client, session.profile.id)
      : Promise.resolve([]);
    const reportPromise = hasPermission(session.access, PERMISSIONS.reportsSubmit)
      ? reportSection(session.client, session.profile.id, day)
      : Promise.resolve({ totalReports: 0, approved: 0, submitted: 0, needsUpdate: 0, rejected: 0 });

    const [attendanceResult, taskResult, reportResult] = await Promise.allSettled([
      attendancePromise,
      taskPromise,
      reportPromise
    ]);
    const errors = [];
    const attendance = sectionError("attendance", attendanceResult, errors);
    const tasks = sectionError("tasks", taskResult, errors);
    const reportSummary = sectionError("reports", reportResult, errors);

    return Response.json({
      data: {
        attendance: attendance?.attendance ?? null,
        breaks: attendance?.breaks ?? null,
        plan: attendance?.plan ?? null,
        tasks,
        reportSummary
      },
      errors
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(error);
  }
}
