import { assertActivityEmployee, requireActivitySession, resolveActivityScope, ACTIVITY_PERMISSIONS } from "@/backend/activity/auth";
import { readDeviceQuery, getActivePolicy, getActivityProfiles, mapDevice, mapScreenshot, mapSession } from "@/backend/activity/data";
import { enforceActivityRateLimit } from "@/backend/activity/rateLimit";
import { ActivityError, activityFailure, activitySuccess } from "@/backend/activity/responses";
import { deriveActivityStatus } from "@/backend/activity/status.mjs";
import { isUuid, parseEmployeeFilters } from "@/backend/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const session = await requireActivitySession(request, [
      ACTIVITY_PERMISSIONS.viewSelf,
      ACTIVITY_PERMISSIONS.viewTeam,
      ACTIVITY_PERMISSIONS.viewAll
    ]);
    await enforceActivityRateLimit(session.client, "employee-detail", { limit: 120, windowMs: 60 * 1000 });
    const { employeeId } = await params;
    if (!isUuid(employeeId)) throw new ActivityError("INVALID_EMPLOYEE_ID", "A valid employee ID is required.", 400);
    const scope = await resolveActivityScope(session);
    assertActivityEmployee(scope, employeeId);
    const filters = parseEmployeeFilters(new URL(request.url).searchParams, true);
    const endDate = filters.endDate || new Date().toISOString().slice(0, 10);
    const defaultStart = new Date(`${endDate}T00:00:00Z`);
    defaultStart.setUTCDate(defaultStart.getUTCDate() - 13);
    const startDate = filters.startDate || defaultStart.toISOString().slice(0, 10);
    const profiles = await getActivityProfiles(session.client, [employeeId]);
    if (!profiles.length) throw new ActivityError("EMPLOYEE_NOT_FOUND", "The employee was not found in your activity scope.", 404);
    // Oversight: record that this viewer opened another employee's activity
    // detail. Best-effort and non-blocking.
    if (employeeId !== session.profile.id) {
      try {
        await session.client.rpc("activity_log_read_access", {
          p_employee_id: employeeId,
          p_action: "activity.viewed",
          p_entity_type: "employee_activity",
          p_entity_id: null,
          p_metadata: { range: { start: startDate, end: endDate } }
        });
      } catch { /* best-effort oversight log; never block the response */ }
    }

    const startTime = `${startDate}T00:00:00.000Z`;
    const endTime = `${endDate}T23:59:59.999Z`;
    const today = new Date().toISOString().slice(0, 10);
    const [devicesResult, sessionsResult, activeSessionResult, summariesResult, heartbeatsResult, usageResult, screenshotsResult, policy] = await Promise.all([
      readDeviceQuery(deviceSelect => session.client.from("employee_devices")
        .select(deviceSelect)
        .eq("employee_id", employeeId).order("registered_at", { ascending: false })),
      session.client.from("tracking_sessions")
        .select("id,employee_id,device_id,project_id,task_id,started_at,ended_at,status,start_source,end_source")
        .eq("employee_id", employeeId).gte("started_at", startTime).lte("started_at", endTime)
        .order("started_at", { ascending: false }).limit(filters.limit),
      session.client.from("tracking_sessions")
        .select("id,employee_id,device_id,project_id,task_id,started_at,ended_at,status,start_source,end_source")
        .eq("employee_id", employeeId).eq("status", "active").is("ended_at", null)
        .order("started_at", { ascending: false }).limit(1).maybeSingle(),
      session.client.from("activity_daily_summaries")
        .select("summary_date,tracked_seconds,active_seconds,idle_seconds,offline_seconds,activity_percentage")
        .eq("employee_id", employeeId).gte("summary_date", startDate).lte("summary_date", endDate)
        .order("summary_date", { ascending: false }),
      session.client.from("agent_heartbeats")
        .select("device_id,tracking_session_id,recorded_at,agent_version,online_status,battery_level")
        .eq("employee_id", employeeId).order("recorded_at", { ascending: false }).limit(50),
      session.client.rpc("activity_employee_usage_summary", {
        p_employee_id: employeeId,
        p_start_at: startTime,
        p_end_at: endTime,
        p_today_start: `${today}T00:00:00.000Z`
      }),
      session.client.from("activity_screenshots")
        .select("id,captured_at,storage_path,active_application")
        .eq("employee_id", employeeId).gte("captured_at", startTime).lte("captured_at", endTime)
        .order("captured_at", { ascending: false }).limit(200),
      getActivePolicy(session.client, { required: false })
    ]);
    const failure = [devicesResult, sessionsResult, activeSessionResult, summariesResult, heartbeatsResult, usageResult, screenshotsResult]
      .find(result => result.error);
    if (failure) throw failure.error;

    const sessions = sessionsResult.data || [];
    const currentSession = activeSessionResult.data || null;
    const primaryDevice = currentSession
      ? null
      : (devicesResult.data || [])
          .filter(item => item.status === "active")
          .sort((a, b) => String(b.last_seen_at || "").localeCompare(String(a.last_seen_at || "")))[0] || null;
    const heartbeat = currentSession
      ? (heartbeatsResult.data || []).find(item =>
          item.tracking_session_id === currentSession.id
          && item.device_id === currentSession.device_id
        ) || null
      : heartbeatsResult.data?.[0] || null;
    const usageRows = usageResult.data || [];
    const input = usageRows.find(row => row.category === "input");
    const todayInputActivity = {
      keyboardEventCount: Number(input?.keyboard_event_count) || 0,
      mouseEventCount: Number(input?.mouse_event_count) || 0,
      sampleCount: Number(input?.sample_count) || 0,
      lastSampleAt: input?.last_seen_at || null
    };
    const websiteUsage = usageRows.filter(row => row.category === "website")
      .map(row => ({ domain: row.primary_label, durationSeconds: Number(row.duration_seconds) || 0, lastSeenAt: row.last_seen_at }))
      .sort((a, b) => b.durationSeconds - a.durationSeconds).slice(0, 25);
    const applicationUsage = policy?.collect_application_names ? usageRows.filter(row => row.category === "application")
      .map(row => ({ application: row.primary_label, sampleCount: Number(row.sample_count) || 0, lastSeenAt: row.last_seen_at }))
      .sort((a, b) => b.sampleCount - a.sampleCount).slice(0, 25) : [];
    const codingUsage = policy?.collect_coding_project_names ? usageRows.filter(row => row.category === "coding")
      .map(row => ({ ideName: row.primary_label, projectName: row.secondary_label, durationSeconds: Number(row.duration_seconds) || 0, lastSeenAt: row.last_seen_at }))
      .sort((a, b) => b.durationSeconds - a.durationSeconds).slice(0, 25) : [];
    return activitySuccess({
      employee: profiles[0],
      currentStatus: deriveActivityStatus({
        session: currentSession,
        heartbeat,
        device: primaryDevice,
        idleThresholdSeconds: policy?.idle_threshold_seconds || 300
      }),
      currentSession: currentSession ? mapSession(currentSession) : null,
      devices: (devicesResult.data || []).map(mapDevice),
      dailySummaries: (summariesResult.data || []).map(row => ({
        date: row.summary_date,
        trackedSeconds: row.tracked_seconds,
        activeSeconds: row.active_seconds,
        idleSeconds: row.idle_seconds,
        offlineSeconds: row.offline_seconds,
        activityPercentage: Number(row.activity_percentage)
      })),
      timeline: sessions.map(mapSession),
      todayInputActivity,
      websiteUsage,
      applicationUsage,
      codingUsage,
      screenshots: (screenshotsResult.data || []).map(mapScreenshot),
      recentHeartbeat: heartbeat ? {
        deviceId: heartbeat.device_id,
        trackingSessionId: heartbeat.tracking_session_id,
        recordedAt: heartbeat.recorded_at,
        agentVersion: heartbeat.agent_version,
        onlineStatus: heartbeat.online_status,
        batteryLevel: heartbeat.battery_level
      } : null,
      range: { startDate, endDate }
    });
  } catch (error) {
    return activityFailure(error);
  }
}
