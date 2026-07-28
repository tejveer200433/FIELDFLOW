import { ApiError, apiFailure, assertUserInScope, requireAnyPermission, requirePermission, resolveUserScope } from "@/lib/supabaseServer";
import { formatDuration } from "@/lib/time";

export const dynamic = "force-dynamic";
const validLocation = value => value && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude));
const attendanceSelect = "*";
const geofenceMessages = [
  "Attendance is not configured yet. Ask an administrator to add an office or site location.",
  "You are outside the allowed office or site radius. Move closer to your assigned attendance location and try again.",
  "No attendance location is assigned to you for this time. Ask your manager or administrator to update your attendance assignment.",
  "You have approved leave for today. Ask your manager to cancel the leave before checking in.",
  "End your current break before checking out."
];
const clock = (value, timeZone) => new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
const localDay = (value, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};
function map(row, context = {}) {
  const profile = context.profileById?.get(row.employee_id);
  const checkInGeofence = context.locationById?.get(row.check_in_location_id);
  const checkOutGeofence = context.locationById?.get(row.check_out_location_id);
  const template = context.templateById?.get(row.shift_template_id);
  const seconds = Math.max(0, Math.floor(((row.check_out_at ? new Date(row.check_out_at) : new Date()).getTime() - new Date(row.check_in_at).getTime()) / 1000));
  const missedCheckout = !row.check_out_at && row.scheduled_end_at && template
    ? Date.now() > new Date(row.scheduled_end_at).getTime() + template.auto_checkout_after_minutes * 60000
    : false;
  return {
    id: row.id,
    employeeId: row.employee_id,
    employee: profile?.full_name || "Employee",
    date: row.work_date,
    checkIn: clock(row.check_in_at, row.time_zone),
    checkOut: row.check_out_at ? clock(row.check_out_at, row.time_zone) : null,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    durationSeconds: seconds,
    hours: formatDuration(seconds),
    timeZone: row.time_zone,
    status: row.attendance_status,
    shiftTemplateId: row.shift_template_id,
    shiftName: template?.name || null,
    scheduledStartAt: row.scheduled_start_at,
    scheduledEndAt: row.scheduled_end_at,
    breakMinutes: row.break_minutes || 0,
    workedMinutes: row.worked_minutes || (row.check_out_at ? Math.floor(seconds / 60) : 0),
    overtimeMinutes: row.overtime_minutes || 0,
    weeklyOff: Boolean(row.is_weekly_off),
    holiday: Boolean(row.is_holiday),
    missedCheckout,
    checkInLocation: {
      latitude: row.check_in_lat,
      longitude: row.check_in_lng,
      accuracy: row.check_in_accuracy,
      geofenceId: row.check_in_location_id,
      geofenceName: checkInGeofence?.name || null,
      geofenceRadiusM: checkInGeofence?.radius_m ?? null,
      distanceM: row.check_in_distance_m
    },
    checkOutLocation: row.check_out_lat == null ? null : {
      latitude: row.check_out_lat,
      longitude: row.check_out_lng,
      accuracy: row.check_out_accuracy,
      geofenceId: row.check_out_location_id,
      geofenceName: checkOutGeofence?.name || null,
      geofenceRadiusM: checkOutGeofence?.radius_m ?? null,
      distanceM: row.check_out_distance_m
    }
  };
}

async function hydrateAttendance(client, rows) {
  const employeeIds = [...new Set(rows.map(row => row.employee_id).filter(Boolean))];
  const locationIds = [...new Set(rows.flatMap(row => [row.check_in_location_id, row.check_out_location_id]).filter(Boolean))];
  const templateIds = [...new Set(rows.map(row => row.shift_template_id).filter(Boolean))];
  const [profilesResult, locationsResult, templatesResult] = await Promise.all([
    employeeIds.length ? client.from("profiles").select("id,full_name").in("id", employeeIds) : Promise.resolve({ data: [], error: null }),
    locationIds.length ? client.from("attendance_locations").select("id,name,radius_m").in("id", locationIds) : Promise.resolve({ data: [], error: null }),
    templateIds.length ? client.from("attendance_shift_templates").select("id,name,auto_checkout_after_minutes").in("id", templateIds) : Promise.resolve({ data: [], error: null })
  ]);
  const failure = [profilesResult, locationsResult, templatesResult].find(item => item.error);
  if (failure) throw failure.error;
  return {
    profileById: new Map(profilesResult.data.map(item => [item.id, item])),
    locationById: new Map(locationsResult.data.map(item => [item.id, item])),
    templateById: new Map(templatesResult.data.map(item => [item.id, item]))
  };
}

function throwRpcError(error) {
  const message = geofenceMessages.find(item => error?.message?.includes(item));
  if (message) throw new ApiError(message, 403);
  throw error;
}

export async function GET(request) {
  try {
    const session = await requireAnyPermission(request, ["attendance.view_self", "attendance.view_team", "attendance.view_all"]);
    const { client } = session;
    const scope = await resolveUserScope(session, { self: "attendance.view_self", team: "attendance.view_team", all: "attendance.view_all" });
    let query = client.from("attendance_shifts").select(attendanceSelect).order("check_in_at", { ascending: false });
    if (scope.type !== "all") query = query.in("employee_id", scope.userIds);
    const requested = new URL(request.url).searchParams.get("employeeId");
    if (requested) {
      assertUserInScope(scope, requested);
      query = query.eq("employee_id", requested);
    }
    const { data, error } = await query;
    if (error) throw error;
    const context = await hydrateAttendance(client, data);
    return Response.json({ data: data.map(row => map(row, context)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiFailure(error); }
}

export async function POST(request) {
  try {
    const { client, profile } = await requirePermission(request, "attendance.view_self");
    const body = await request.json();
    if (!["check-in", "check-out"].includes(body.action) || !validLocation(body.location)) throw new ApiError("A valid action and GPS location are required.");
    let timeZone = String(body.timeZone || "Asia/Kolkata");
    try { new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date()); } catch { timeZone = "Asia/Kolkata"; }
    const now = new Date();
    if (body.action === "check-in") {
      const { data: id, error } = await client.rpc("check_in_with_gps", { p_time_zone: timeZone, p_lat: Number(body.location.latitude), p_lng: Number(body.location.longitude), p_accuracy: Number(body.location.accuracy) || null });
      if (error?.code === "23505") throw new ApiError("You are already checked in.", 409);
      if (error) throwRpcError(error);
      const { data, error: readError } = await client.from("attendance_shifts").select(attendanceSelect).eq("id", id).single();
      if (readError) throw readError;
      const context = await hydrateAttendance(client, [data]);
      return Response.json({ data: map(data, context) }, { status: 201 });
    }
    const { data: open, error: openError } = await client.from("attendance_shifts").select("id").eq("employee_id", profile.id).is("check_out_at", null).maybeSingle();
    if (openError) throw openError;
    if (!open) throw new ApiError("No active check-in was found.", 409);
    const { data: id, error } = await client.rpc("check_out_with_gps", { p_lat: Number(body.location.latitude), p_lng: Number(body.location.longitude), p_accuracy: Number(body.location.accuracy) || null });
    if (error) throwRpcError(error);
    const { data, error: readError } = await client.from("attendance_shifts").select(attendanceSelect).eq("id", id).single();
    if (readError) throw readError;
    const context = await hydrateAttendance(client, [data]);
    return Response.json({ data: map(data, context) });
  } catch (error) { return apiFailure(error); }
}
