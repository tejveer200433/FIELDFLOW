import { apiFailure, requirePermission } from "@/backend/supabase/supabaseServer";
import { hasPermission, PERMISSIONS } from "@/shared/permissions";
import {
  consumeGuideRateLimit,
  createAiGuideResponse,
  fallbackGuideResponse,
  parseGuideRequest
} from "@/backend/ai/fieldflowGuide";

export const dynamic = "force-dynamic";

function localDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}

async function buildTrustedSnapshot(session) {
  const { client, profile, access } = session;
  const canViewTasks = hasPermission(access, PERMISSIONS.tasksViewSelf);
  const canViewAttendance = hasPermission(access, PERMISSIONS.attendanceViewSelf);
  const canViewActivity = hasPermission(access, "activity.view_self");
  const today = localDay();
  const [tasksResult, assigneesResult, attendanceResult, reportResult, trackingResult, deviceResult] = await Promise.all([
    canViewTasks
      ? client.from("tasks").select("id,title,client,address,priority,status,scheduled_at,description,checklist,estimated_minutes,updated_at,employee_id").is("archived_at", null).order("updated_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    canViewTasks
      ? client.from("task_assignees").select("task_id").eq("employee_id", profile.id)
      : Promise.resolve({ data: [], error: null }),
    canViewAttendance
      ? client.from("attendance_shifts").select("id,work_date,check_in_at,check_out_at,attendance_status,check_in_location_id,shift_template_id").eq("employee_id", profile.id).order("check_in_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    hasPermission(access, PERMISSIONS.reportsSubmit)
      ? client.from("daily_reports").select("id,status").eq("employee_id", profile.id).eq("report_date", today).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    canViewActivity
      ? client.from("tracking_sessions").select("id,device_id,task_id,started_at,status").eq("employee_id", profile.id).eq("status", "active").is("ended_at", null).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    canViewActivity
      ? client.from("employee_devices").select("id,device_name,status,last_seen_at").eq("employee_id", profile.id).order("last_seen_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  const taskRows = tasksResult.error ? [] : tasksResult.data || [];
  const assignedIds = new Set(assigneesResult.error ? [] : (assigneesResult.data || []).map(item => item.task_id));
  const assignedTasks = taskRows.filter(task => task.employee_id === profile.id || assignedIds.has(task.id)).slice(0, 20);
  const attendance = attendanceResult.error ? null : attendanceResult.data;
  let locationName = null;
  let plan = null;
  let onBreak = false;
  if (attendance?.check_in_location_id) {
    const { data } = await client.from("attendance_locations").select("name").eq("id", attendance.check_in_location_id).maybeSingle();
    locationName = data?.name || null;
  }
  if (attendance?.shift_template_id) {
    const { data } = await client.from("attendance_shift_templates").select("name,start_time,end_time").eq("id", attendance.shift_template_id).maybeSingle();
    plan = data ? { name: data.name, startTime: data.start_time, endTime: data.end_time } : null;
  }
  if (attendance && !attendance.check_out_at) {
    const { data } = await client.from("attendance_breaks").select("id").eq("shift_id", attendance.id).is("ended_at", null).limit(1).maybeSingle();
    onBreak = Boolean(data);
  }
  return {
    generatedAt: new Date().toISOString(),
    localDay: today,
    employee: { firstName: String(profile.full_name || "Employee").split(" ")[0] },
    permissions: {
      tasks: canViewTasks,
      attendance: canViewAttendance,
      activity: canViewActivity,
      reports: hasPermission(access, PERMISSIONS.reportsSubmit),
      sos: hasPermission(access, PERMISSIONS.sosCreate)
    },
    attendance: {
      active: Boolean(attendance && !attendance.check_out_at),
      status: attendance?.attendance_status || null,
      checkedInAt: attendance?.check_in_at || null,
      onBreak,
      location: locationName
    },
    plan,
    tasks: assignedTasks.map(task => ({
      id: task.id,
      title: task.title,
      client: task.client || null,
      address: task.address || null,
      priority: task.priority || null,
      status: task.status,
      scheduledAt: task.scheduled_at || null,
      estimatedMinutes: Number(task.estimated_minutes) || null,
      checklist: Array.isArray(task.checklist) ? task.checklist.slice(0, 30).map(item => ({
        text: String(item.text || "").slice(0, 160), completed: Boolean(item.completed)
      })) : []
    })),
    dailyReport: reportResult.error ? { available: false } : {
      available: true,
      submitted: Boolean(reportResult.data),
      status: reportResult.data?.status || null
    },
    tracking: {
      active: Boolean(!trackingResult.error && trackingResult.data),
      taskId: trackingResult.data?.task_id || null,
      startedAt: trackingResult.data?.started_at || null,
      deviceName: deviceResult.error ? null : deviceResult.data?.device_name || null,
      deviceStatus: deviceResult.error ? null : deviceResult.data?.status || null,
      lastSeenAt: deviceResult.error ? null : deviceResult.data?.last_seen_at || null
    },
    unavailableSections: [
      tasksResult.error && "tasks",
      assigneesResult.error && "task assignments",
      attendanceResult.error && "attendance",
      reportResult.error && "daily report",
      trackingResult.error && "tracking",
      deviceResult.error && "device"
    ].filter(Boolean)
  };
}

export async function POST(request) {
  try {
    const session = await requirePermission(request, PERMISSIONS.dashboardView);
    consumeGuideRateLimit(session.profile.id);
    const { message, history } = parseGuideRequest(await request.json());
    const snapshot = await buildTrustedSnapshot(session);
    const fallback = fallbackGuideResponse(message, snapshot);
    const apiKey = process.env.OPENAI_API_KEY;
    const externalAiEnabled = process.env.FIELDFLOW_AI_ENABLED === "true";
    if (!externalAiEnabled || !apiKey) {
      return Response.json({ data: { ...fallback, mode: "guided", generatedAt: snapshot.generatedAt } }, { headers: { "Cache-Control": "no-store" } });
    }
    try {
      const answer = await createAiGuideResponse({
        apiKey,
        model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
        userId: session.profile.id,
        message,
        history,
        snapshot
      });
      return Response.json({ data: { ...answer, mode: "ai", generatedAt: snapshot.generatedAt } }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      console.error("[FieldFlow Guide] model request failed", error);
      return Response.json({ data: { ...fallback, mode: "guided", generatedAt: snapshot.generatedAt }, warning: "AI response was unavailable, so FieldFlow used its trusted workday guidance." }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (error) {
    return apiFailure(error);
  }
}
