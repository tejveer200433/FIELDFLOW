import {
  ApiError,
  apiFailure,
  assertUserInScope,
  requireAnyPermission,
  resolveUserScope
} from "@/lib/supabaseServer";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const managementPermissions = [
  "attendance.view_self",
  "attendance.view_team",
  "attendance.view_all",
  "attendance.approve",
  "settings.manage"
];

const clean = (value, max = 1000) => String(value || "").trim().slice(0, max);
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function date(value, label) {
  const result = clean(value, 10);
  if (!datePattern.test(result)) throw new ApiError(`${label} is required.`);
  return result;
}

function optionalDate(value, label) {
  return value ? date(value, label) : null;
}

function time(value, label) {
  const result = clean(value, 8);
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(result)) throw new ApiError(`${label} is required.`);
  return result;
}

function number(value, label, min, max) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) {
    throw new ApiError(`${label} must be between ${min} and ${max}.`);
  }
  return result;
}

function weekdays(value, fallback = [1, 2, 3, 4, 5]) {
  const result = [...new Set(Array.isArray(value) ? value.map(Number) : fallback)];
  if (!result.length || result.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new ApiError("Select at least one valid weekday.");
  }
  return result;
}

function timeMinutes(value) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

async function assertActiveShift(client, shiftTemplateId) {
  if (!shiftTemplateId) throw new ApiError("Select a work shift.");
  const { data: shift, error } = await client.from("attendance_shift_templates")
    .select("id,active")
    .eq("id", shiftTemplateId)
    .maybeSingle();
  if (error) throw error;
  if (!shift) throw new ApiError("The selected work shift no longer exists.", 404);
  if (!shift.active) throw new ApiError("The selected work shift is disabled. Enable it or select another shift.");
}

function attendanceUpgradeError(error) {
  if (["42P01", "PGRST205", "PGRST204"].includes(error?.code)
    || /attendance_(shift_templates|geofence_assignments|corrections|breaks)/i.test(error?.message || "")) {
    return new ApiError("Attendance management is not installed yet. Run migration 202607240002_attendance_management.sql in Supabase.", 503);
  }
  return error;
}

async function result(query) {
  const { data, error } = await query;
  if (error) throw attendanceUpgradeError(error);
  return data || [];
}

function allScope(access) {
  return access.isOwner
    || hasPermission(access, "attendance.view_all")
    || hasPermission(access, "settings.manage");
}

async function attendanceScope(session) {
  if (allScope(session.access)) return { type: "all", userIds: null };
  if (hasPermission(session.access, "attendance.view_team")) {
    return resolveUserScope(session, { team: "attendance.view_team" });
  }
  if (hasPermission(session.access, "attendance.approve")) {
    return resolveUserScope(session, { team: "attendance.approve" });
  }
  return { type: "self", userIds: [session.profile.id] };
}

async function assertManageUser(session, userId) {
  if (!userId) throw new ApiError("Select an employee.");
  if (!hasPermission(session.access, "attendance.approve") && !hasPermission(session.access, "settings.manage")) {
    throw new ApiError("You do not have permission to manage attendance plans.", 403);
  }
  if (allScope(session.access)) return;
  const scope = await resolveUserScope(session, { team: "attendance.approve" });
  assertUserInScope(scope, userId);
}

function mapTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    startTime: row.start_time,
    endTime: row.end_time,
    unpaidBreakMinutes: row.unpaid_break_minutes,
    graceMinutes: row.grace_minutes,
    autoCheckoutAfterMinutes: row.auto_checkout_after_minutes,
    weeklyOffDays: row.weekly_off_days || [],
    active: row.active
  };
}

export async function GET(request) {
  try {
    const session = await requireAnyPermission(request, managementPermissions);
    const scope = await attendanceScope(session);
    const url = new URL(request.url);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const from = date(url.searchParams.get("from") || `${today.slice(0, 8)}01`, "Start date");
    const to = date(url.searchParams.get("to") || monthEnd, "End date");
    if (to < from) throw new ApiError("End date must not be before start date.");

    let profileQuery = session.client.from("profiles")
      .select("id,full_name,email,department")
      .order("full_name");
    let scheduleQuery = session.client.from("employee_attendance_schedules")
      .select("*")
      .order("effective_from", { ascending: false })
      .limit(500);
    let rosterQuery = session.client.from("attendance_rosters")
      .select("*").gte("work_date", from).lte("work_date", to).order("work_date");
    let breakQuery = session.client.from("attendance_breaks")
      .select("*").order("started_at", { ascending: false }).limit(500);
    let leaveQuery = session.client.from("leave_requests")
      .select("*").lte("start_date", to).gte("end_date", from).order("created_at", { ascending: false });
    let correctionQuery = session.client.from("attendance_corrections")
      .select("*").order("created_at", { ascending: false }).limit(250);

    if (scope.type !== "all") {
      profileQuery = profileQuery.in("id", scope.userIds);
      scheduleQuery = scheduleQuery.in("employee_id", scope.userIds);
      rosterQuery = rosterQuery.in("employee_id", scope.userIds);
      breakQuery = breakQuery.in("employee_id", scope.userIds);
      leaveQuery = leaveQuery.in("employee_id", scope.userIds);
      correctionQuery = correctionQuery.in("employee_id", scope.userIds);
    }

    const [
      profiles,
      templates,
      schedules,
      rosters,
      holidays,
      breaks,
      leaves,
      corrections,
      assignments,
      locations,
      teams,
      projects
    ] = await Promise.all([
      result(profileQuery),
      result(session.client.from("attendance_shift_templates").select("*").order("name")),
      result(scheduleQuery),
      result(rosterQuery),
      result(session.client.from("attendance_holidays").select("*").gte("holiday_date", from).lte("holiday_date", to).order("holiday_date")),
      result(breakQuery),
      result(leaveQuery),
      result(correctionQuery),
      result(session.client.from("attendance_geofence_assignments").select("*").order("created_at", { ascending: false })),
      result(session.client.from("attendance_locations").select("id,name,radius_m,active").order("name")),
      result(session.client.from("teams").select("id,name").order("name")),
      result(session.client.from("projects").select("id,title,status").order("title"))
    ]);

    const profileById = new Map(profiles.map(profile => [profile.id, profile]));
    const templateById = new Map(templates.map(template => [template.id, template]));
    const locationById = new Map(locations.map(location => [location.id, location]));
    const teamById = new Map(teams.map(team => [team.id, team]));
    const projectById = new Map(projects.map(project => [project.id, project]));
    const name = userId => profileById.get(userId)?.full_name || "Employee";

    return Response.json({
      data: {
        range: { from, to },
        capabilities: {
          canApprove: hasPermission(session.access, "attendance.approve"),
          canConfigure: hasPermission(session.access, "settings.manage"),
          allScope: scope.type === "all"
        },
        employees: profiles.map(profile => ({
          id: profile.id,
          name: profile.full_name,
          email: profile.email,
          department: profile.department
        })),
        templates: templates.map(mapTemplate),
        schedules: schedules.map(row => ({
          id: row.id,
          employeeId: row.employee_id,
          employee: name(row.employee_id),
          shiftTemplateId: row.shift_template_id,
          shiftName: templateById.get(row.shift_template_id)?.name || "Shift",
          effectiveFrom: row.effective_from,
          effectiveTo: row.effective_to,
          weekdays: row.weekdays || []
        })),
        rosters: rosters.map(row => ({
          id: row.id,
          employeeId: row.employee_id,
          employee: name(row.employee_id),
          workDate: row.work_date,
          shiftTemplateId: row.shift_template_id,
          shiftName: templateById.get(row.shift_template_id)?.name || "Shift",
          checkInLocationId: row.check_in_location_id,
          checkOutLocationId: row.check_out_location_id,
          notes: row.notes || ""
        })),
        holidays: holidays.map(row => ({
          id: row.id,
          name: row.name,
          date: row.holiday_date,
          locationId: row.location_id,
          locationName: locationById.get(row.location_id)?.name || null
        })),
        breaks: breaks.map(row => ({
          id: row.id,
          shiftId: row.shift_id,
          employeeId: row.employee_id,
          employee: name(row.employee_id),
          startedAt: row.started_at,
          endedAt: row.ended_at
        })),
        leaves: leaves.map(row => ({
          id: row.id,
          employeeId: row.employee_id,
          employee: name(row.employee_id),
          type: row.leave_type,
          startDate: row.start_date,
          endDate: row.end_date,
          reason: row.reason,
          status: row.status,
          reviewerComment: row.reviewer_comment || "",
          createdAt: row.created_at
        })),
        corrections: corrections.map(row => ({
          id: row.id,
          shiftId: row.shift_id,
          employeeId: row.employee_id,
          employee: name(row.employee_id),
          requestedCheckInAt: row.requested_check_in_at,
          requestedCheckOutAt: row.requested_check_out_at,
          reason: row.reason,
          status: row.status,
          reviewerComment: row.reviewer_comment || "",
          createdAt: row.created_at
        })),
        assignments: assignments.map(row => {
          const target = row.target_type === "employee"
            ? name(row.employee_id)
            : row.target_type === "team"
              ? teamById.get(row.team_id)?.name
              : row.target_type === "project"
                ? projectById.get(row.project_id)?.title
                : "All employees";
          return {
            id: row.id,
            locationId: row.location_id,
            locationName: locationById.get(row.location_id)?.name || "Location",
            targetType: row.target_type,
            targetId: row.employee_id || row.team_id || row.project_id || "",
            target: target || "Unavailable target",
            eventType: row.event_type,
            validFrom: row.valid_from,
            validUntil: row.valid_until,
            weekdays: row.weekdays || [],
            windowStart: row.window_start,
            windowEnd: row.window_end,
            active: row.active
          };
        }),
        locations: locations.map(row => ({
          id: row.id,
          name: row.name,
          radiusM: row.radius_m,
          active: row.active
        })),
        teams,
        projects: projects.map(project => ({ id: project.id, name: project.title, status: project.status }))
      }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(attendanceUpgradeError(error));
  }
}

export async function POST(request) {
  try {
    const session = await requireAnyPermission(request, managementPermissions);
    const body = await request.json();
    const action = body.action;

    if (action === "break-start" || action === "break-end") {
      if (!hasPermission(session.access, "attendance.view_self")) {
        throw new ApiError("You do not have permission to record breaks.", 403);
      }
      const rpc = action === "break-start" ? "start_attendance_break" : "end_attendance_break";
      const { data, error } = await session.client.rpc(rpc);
      if (error?.code === "23505") throw new ApiError("You already have an active break.", 409);
      if (error) throw error;
      return Response.json({ data: { id: data }, message: action === "break-start" ? "Break started." : "Break ended." });
    }

    if (action === "leave") {
      if (!hasPermission(session.access, "attendance.view_self")) throw new ApiError("You do not have permission to request leave.", 403);
      const leaveType = clean(body.type, 40);
      if (!["Annual", "Sick", "Casual", "Unpaid", "Other"].includes(leaveType)) throw new ApiError("Select a valid leave type.");
      const startDate = date(body.startDate, "Leave start date");
      const endDate = date(body.endDate, "Leave end date");
      if (endDate < startDate) throw new ApiError("Leave end date must not be before the start date.");
      const reason = clean(body.reason, 2000);
      if (reason.length < 2) throw new ApiError("Enter a reason for the leave request.");
      const { data: overlap, error: overlapError } = await session.client.from("leave_requests")
        .select("id").eq("employee_id", session.profile.id)
        .in("status", ["Pending", "Approved"])
        .lte("start_date", endDate).gte("end_date", startDate).limit(1);
      if (overlapError) throw overlapError;
      if (overlap?.length) throw new ApiError("A pending or approved leave request already overlaps these dates.", 409);
      const { data: created, error } = await session.client.from("leave_requests").insert({
        employee_id: session.profile.id,
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason
      }).select("id").single();
      if (error) throw error;
      return Response.json({ data: created, message: "Leave request submitted." }, { status: 201 });
    }

    if (action === "correction") {
      if (!hasPermission(session.access, "attendance.view_self")) throw new ApiError("You do not have permission to request a correction.", 403);
      if (!body.shiftId) throw new ApiError("Select an attendance record.");
      const reason = clean(body.reason, 2000);
      if (reason.length < 2) throw new ApiError("Enter a reason for the correction.");
      const requestedCheckInAt = body.requestedCheckInAt ? new Date(body.requestedCheckInAt) : null;
      const requestedCheckOutAt = body.requestedCheckOutAt ? new Date(body.requestedCheckOutAt) : null;
      if (requestedCheckInAt && Number.isNaN(requestedCheckInAt.getTime())) throw new ApiError("Enter a valid requested check-in time.");
      if (requestedCheckOutAt && Number.isNaN(requestedCheckOutAt.getTime())) throw new ApiError("Enter a valid requested check-out time.");
      if (!requestedCheckInAt && !requestedCheckOutAt) throw new ApiError("Enter a corrected check-in or check-out time.");
      const { data: created, error } = await session.client.from("attendance_corrections").insert({
        shift_id: body.shiftId,
        employee_id: session.profile.id,
        requested_check_in_at: requestedCheckInAt?.toISOString() || null,
        requested_check_out_at: requestedCheckOutAt?.toISOString() || null,
        reason
      }).select("id").single();
      if (error?.code === "23505") throw new ApiError("A correction for this attendance record is already pending.", 409);
      if (error) throw error;
      return Response.json({ data: created, message: "Attendance correction submitted." }, { status: 201 });
    }

    if (action === "shift-template") {
      if (!hasPermission(session.access, "attendance.approve") && !hasPermission(session.access, "settings.manage")) {
        throw new ApiError("You do not have permission to create work shifts.", 403);
      }
      const name = clean(body.name, 120);
      if (name.length < 2) throw new ApiError("Shift name must contain at least two characters.");
      const startTime = time(body.startTime, "Shift start time");
      const endTime = time(body.endTime, "Shift end time");
      if (startTime === endTime) throw new ApiError("Shift start and end times must be different.");
      const durationMinutes = (timeMinutes(endTime) - timeMinutes(startTime) + 1440) % 1440;
      const unpaidBreakMinutes = number(body.unpaidBreakMinutes ?? 0, "Unpaid break", 0, 480);
      if (unpaidBreakMinutes >= durationMinutes) {
        throw new ApiError("Unpaid break must be shorter than the complete shift.");
      }
      const { data: created, error } = await session.client.from("attendance_shift_templates").insert({
        name,
        start_time: startTime,
        end_time: endTime,
        unpaid_break_minutes: unpaidBreakMinutes,
        grace_minutes: number(body.graceMinutes ?? 15, "Grace period", 0, 180),
        auto_checkout_after_minutes: number(body.autoCheckoutAfterMinutes ?? 120, "Missed check-out reminder", 15, 720),
        weekly_off_days: weekdays(body.weeklyOffDays, [0]),
        created_by: session.profile.id
      }).select("id").single();
      if (error) throw error;
      return Response.json({ data: created, message: "Work shift created." }, { status: 201 });
    }

    if (action === "schedule") {
      await assertManageUser(session, body.employeeId);
      await assertActiveShift(session.client, body.shiftTemplateId);
      const effectiveFrom = date(body.effectiveFrom, "Schedule start date");
      const effectiveTo = optionalDate(body.effectiveTo, "Schedule end date");
      if (effectiveTo && effectiveTo < effectiveFrom) throw new ApiError("Schedule end date must not be before its start date.");
      const overlapEnd = effectiveTo || "9999-12-31";
      const { data: overlaps, error: overlapError } = await session.client
        .from("employee_attendance_schedules")
        .select("id,effective_from,effective_to")
        .eq("employee_id", body.employeeId)
        .lte("effective_from", overlapEnd)
        .or(`effective_to.is.null,effective_to.gte.${effectiveFrom}`)
        .limit(1);
      if (overlapError) throw overlapError;
      if (overlaps?.length) {
        throw new ApiError("This employee already has a schedule covering part of that date range. End the existing schedule first.", 409);
      }
      const { data: created, error } = await session.client.from("employee_attendance_schedules").insert({
        employee_id: body.employeeId,
        shift_template_id: body.shiftTemplateId,
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
        weekdays: weekdays(body.weekdays),
        created_by: session.profile.id
      }).select("id").single();
      if (error) throw error;
      return Response.json({ data: created, message: "Employee schedule assigned." }, { status: 201 });
    }

    if (action === "roster") {
      await assertManageUser(session, body.employeeId);
      await assertActiveShift(session.client, body.shiftTemplateId);
      const values = {
        employee_id: body.employeeId,
        work_date: date(body.workDate, "Roster date"),
        shift_template_id: body.shiftTemplateId,
        check_in_location_id: body.checkInLocationId || null,
        check_out_location_id: body.checkOutLocationId || null,
        notes: clean(body.notes, 1000) || null,
        created_by: session.profile.id
      };
      const { data: created, error } = await session.client.from("attendance_rosters")
        .upsert(values, { onConflict: "employee_id,work_date" }).select("id").single();
      if (error) throw error;
      return Response.json({ data: created, message: "Daily roster saved." }, { status: 201 });
    }

    if (action === "holiday") {
      if (!hasPermission(session.access, "attendance.approve") && !hasPermission(session.access, "settings.manage")) {
        throw new ApiError("You do not have permission to manage holidays.", 403);
      }
      const name = clean(body.name, 160);
      if (name.length < 2) throw new ApiError("Holiday name must contain at least two characters.");
      const { data: created, error } = await session.client.from("attendance_holidays").insert({
        name,
        holiday_date: date(body.date, "Holiday date"),
        location_id: body.locationId || null,
        created_by: session.profile.id
      }).select("id").single();
      if (error?.code === "23505") throw new ApiError("This holiday already exists.", 409);
      if (error) throw error;
      return Response.json({ data: created, message: "Holiday added." }, { status: 201 });
    }

    if (action === "geofence-assignment") {
      if (!hasPermission(session.access, "settings.manage")) {
        throw new ApiError("You do not have permission to assign attendance locations.", 403);
      }
      if (!body.locationId) throw new ApiError("Select an attendance location.");
      const targetType = clean(body.targetType, 20);
      if (!["all", "team", "employee", "project"].includes(targetType)) throw new ApiError("Select a valid assignment target.");
      if (targetType !== "all" && !body.targetId) throw new ApiError("Select who can use this location.");
      const eventType = clean(body.eventType || "both", 20);
      if (!["both", "check-in", "check-out"].includes(eventType)) throw new ApiError("Select a valid attendance event.");
      const validFrom = optionalDate(body.validFrom, "Assignment start date");
      const validUntil = optionalDate(body.validUntil, "Assignment expiry date");
      if (validFrom && validUntil && validUntil < validFrom) throw new ApiError("Assignment expiry must not be before its start date.");
      const { data: created, error } = await session.client.from("attendance_geofence_assignments").insert({
        location_id: body.locationId,
        target_type: targetType,
        team_id: targetType === "team" ? body.targetId : null,
        employee_id: targetType === "employee" ? body.targetId : null,
        project_id: targetType === "project" ? body.targetId : null,
        event_type: eventType,
        valid_from: validFrom,
        valid_until: validUntil,
        weekdays: weekdays(body.weekdays, [0, 1, 2, 3, 4, 5, 6]),
        window_start: body.windowStart ? time(body.windowStart, "Allowed start time") : null,
        window_end: body.windowEnd ? time(body.windowEnd, "Allowed end time") : null,
        created_by: session.profile.id
      }).select("id").single();
      if (error) throw error;
      return Response.json({ data: created, message: "Geofence assignment created." }, { status: 201 });
    }

    throw new ApiError("A valid attendance management action is required.");
  } catch (error) {
    return apiFailure(attendanceUpgradeError(error));
  }
}

export async function PATCH(request) {
  try {
    const session = await requireAnyPermission(request, managementPermissions);
    const body = await request.json();

    if (body.action === "review-leave" || body.action === "review-correction") {
      if (!hasPermission(session.access, "attendance.approve") && !hasPermission(session.access, "settings.manage")) {
        throw new ApiError("You do not have permission to review attendance requests.", 403);
      }
      if (!body.id || !["Approved", "Rejected"].includes(body.status)) {
        throw new ApiError("Select a request and a valid decision.");
      }
      const rpc = body.action === "review-leave"
        ? "review_leave_request"
        : "review_attendance_correction";
      const { error } = await session.client.rpc(rpc, {
        p_request_id: body.id,
        p_status: body.status,
        p_comment: clean(body.comment, 1000) || null
      });
      if (error) throw error;
      return Response.json({ message: `${body.action === "review-leave" ? "Leave" : "Correction"} request ${body.status.toLowerCase()}.` });
    }

    if (body.action === "toggle-assignment") {
      if (!hasPermission(session.access, "settings.manage")) {
        throw new ApiError("You do not have permission to change geofence assignments.", 403);
      }
      if (!body.id || typeof body.active !== "boolean") throw new ApiError("Select an assignment and valid status.");
      const { error } = await session.client.from("attendance_geofence_assignments")
        .update({ active: body.active }).eq("id", body.id);
      if (error) throw error;
      return Response.json({ message: `Geofence assignment ${body.active ? "enabled" : "disabled"}.` });
    }

    if (body.action === "toggle-shift") {
      if (!hasPermission(session.access, "attendance.approve") && !hasPermission(session.access, "settings.manage")) {
        throw new ApiError("You do not have permission to change work shifts.", 403);
      }
      if (!body.id || typeof body.active !== "boolean") throw new ApiError("Select a shift and valid status.");
      const { error } = await session.client.from("attendance_shift_templates")
        .update({ active: body.active }).eq("id", body.id);
      if (error) throw error;
      return Response.json({ message: `Work shift ${body.active ? "enabled" : "disabled"}.` });
    }

    throw new ApiError("A valid attendance management update is required.");
  } catch (error) {
    return apiFailure(attendanceUpgradeError(error));
  }
}
