import { requireActivitySession, ACTIVITY_PERMISSIONS, resolveActivityScope } from "@/backend/activity/auth";
import { getActivityProfiles } from "@/backend/activity/data";
import { enforceActivityRateLimit } from "@/backend/activity/rateLimit";
import { ActivityError, activityFailure, activitySuccess, readActivityJson } from "@/backend/activity/responses";

export const dynamic = "force-dynamic";

const REPORTABLE_EVENTS = ["signout_blocked", "quit_blocked", "uninstall_attempt", "agent_stopped"];

const mapEvent = (row, employeeNames = new Map()) => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeName: employeeNames.get(row.employee_id) || null,
  deviceId: row.device_id,
  trackingSessionId: row.tracking_session_id,
  eventType: row.event_type,
  severity: row.severity,
  detail: row.detail || {},
  detectedAt: row.detected_at,
  lastSeenBeforeAt: row.last_seen_before_at,
  resolvedAt: row.resolved_at
});

// Monitors list agent tamper events in their scope. Defaults to open (unresolved).
export async function GET(request) {
  try {
    const session = await requireActivitySession(request, [
      ACTIVITY_PERMISSIONS.viewTeam,
      ACTIVITY_PERMISSIONS.viewAll,
      ACTIVITY_PERMISSIONS.managePolicies
    ]);
    const scope = await resolveActivityScope(session, { allowSelf: false });
    const params = new URL(request.url).searchParams;
    const includeResolved = params.get("includeResolved") === "true";

    let query = session.client
      .from("agent_tamper_events")
      .select("*")
      .order("detected_at", { ascending: false })
      .limit(500);
    if (!includeResolved) query = query.is("resolved_at", null);
    if (scope.userIds) query = query.in("employee_id", scope.userIds);

    const { data, error } = await query;
    if (error) throw error;

    const employeeIds = [...new Set((data || []).map(row => row.employee_id).filter(Boolean))];
    const profiles = employeeIds.length ? await getActivityProfiles(session.client, employeeIds) : [];
    const employeeNames = new Map(profiles.map(profile => [profile.employeeId, profile.name]));
    return activitySuccess({ events: (data || []).map(row => mapEvent(row, employeeNames)) });
  } catch (error) {
    return activityFailure(error);
  }
}

// The employee's own agent reports a locally blocked action or an observed removal.
export async function POST(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    await enforceActivityRateLimit(session.client, "agent-events", { limit: 12, windowMs: 60_000 });
    const body = await readActivityJson(request);

    const deviceId = String(body.deviceId || "").trim();
    const eventType = String(body.eventType || "").trim();
    if (!deviceId) throw new ActivityError("INVALID_DEVICE", "Device identifier is required.", 400);
    if (!REPORTABLE_EVENTS.includes(eventType)) {
      throw new ActivityError("INVALID_EVENT_TYPE", "Agent event type is invalid.", 400);
    }
    const detail = body.detail && typeof body.detail === "object" && !Array.isArray(body.detail) ? body.detail : {};

    const { data, error } = await session.client.rpc("activity_report_agent_event", {
      p_device_id: deviceId,
      p_event_type: eventType,
      p_detail: detail
    });
    if (error) throw error;
    return activitySuccess(mapEvent(Array.isArray(data) ? data[0] : data), { status: 201 });
  } catch (error) {
    return activityFailure(error);
  }
}
