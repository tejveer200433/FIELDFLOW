import { assertActivityEmployee, requireActivitySession, resolveActivityScope, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import { getActivePolicy, getActivityProfiles, mapDevice, mapScreenshot, mapSession } from "@/lib/activity/data";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { ActivityError, activityFailure, activitySuccess } from "@/lib/activity/responses";
import { deriveActivityStatus } from "@/lib/activity/status.mjs";
import { isUuid, parseEmployeeFilters } from "@/lib/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const session = await requireActivitySession(request, [
      ACTIVITY_PERMISSIONS.viewSelf,
      ACTIVITY_PERMISSIONS.viewTeam,
      ACTIVITY_PERMISSIONS.viewAll
    ]);
    enforceActivityRateLimit(request, "employee-detail", session.profile.id, { limit: 120, windowMs: 60 * 1000 });
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

    const startTime = `${startDate}T00:00:00.000Z`;
    const endTime = `${endDate}T23:59:59.999Z`;
    const [devicesResult, sessionsResult, activeSessionResult, summariesResult, heartbeatsResult, samplesResult, websitesResult, codingResult, screenshotsResult, policy] = await Promise.all([
      session.client.from("employee_devices")
        .select("id,employee_id,device_name,platform,operating_system_version,agent_version,status,registered_at,last_seen_at,revoked_at")
        .eq("employee_id", employeeId).order("registered_at", { ascending: false }),
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
      session.client.from("activity_samples")
        .select("tracking_session_id,captured_at,active_application,idle_seconds,keyboard_event_count,mouse_event_count")
        .eq("employee_id", employeeId).gte("captured_at", startTime).lte("captured_at", endTime)
        .order("captured_at", { ascending: false }).limit(5000),
      session.client.from("website_activity_samples")
        .select("captured_at,domain,browser_name,duration_seconds")
        .eq("employee_id", employeeId).gte("captured_at", startTime).lte("captured_at", endTime)
        .order("captured_at", { ascending: false }).limit(5000),
      session.client.from("coding_activity_samples")
        .select("captured_at,ide_name,project_name,duration_seconds")
        .eq("employee_id", employeeId).gte("captured_at", startTime).lte("captured_at", endTime)
        .order("captured_at", { ascending: false }).limit(5000),
      session.client.from("activity_screenshots")
        .select("id,captured_at,storage_path,active_application")
        .eq("employee_id", employeeId).gte("captured_at", startTime).lte("captured_at", endTime)
        .order("captured_at", { ascending: false }).limit(200),
      getActivePolicy(session.client, { required: false })
    ]);
    const failure = [devicesResult, sessionsResult, activeSessionResult, summariesResult, heartbeatsResult, samplesResult, websitesResult, codingResult, screenshotsResult]
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
    const applicationCounts = new Map();
    const websiteCounts = new Map();
    const codingCounts = new Map();
    if (policy?.collect_coding_project_names) {
      for (const sample of codingResult.data || []) {
        const key = `${sample.ide_name}:${sample.project_name}`;
        const current = codingCounts.get(key) || { ideName: sample.ide_name, projectName: sample.project_name, durationSeconds: 0, lastSeenAt: null };
        current.durationSeconds += Number(sample.duration_seconds) || 0;
        if (!current.lastSeenAt) current.lastSeenAt = sample.captured_at;
        codingCounts.set(key, current);
      }
    }
    for (const sample of websitesResult.data || []) {
      const current = websiteCounts.get(sample.domain) || { durationSeconds: 0, lastSeenAt: null };
      current.durationSeconds += Number(sample.duration_seconds) || 0;
      if (!current.lastSeenAt) current.lastSeenAt = sample.captured_at;
      websiteCounts.set(sample.domain, current);
    }
    const today = new Date().toISOString().slice(0, 10);
    const todayInputActivity = {
      keyboardEventCount: 0,
      mouseEventCount: 0,
      sampleCount: 0,
      lastSampleAt: null
    };
    for (const sample of samplesResult.data || []) {
      if (!sample.captured_at?.startsWith(today)) continue;
      todayInputActivity.keyboardEventCount += Number(sample.keyboard_event_count) || 0;
      todayInputActivity.mouseEventCount += Number(sample.mouse_event_count) || 0;
      todayInputActivity.sampleCount += 1;
      if (!todayInputActivity.lastSampleAt) todayInputActivity.lastSampleAt = sample.captured_at;
    }
    if (policy?.collect_application_names) {
      for (const sample of samplesResult.data || []) {
        if (!sample.active_application) continue;
        const current = applicationCounts.get(sample.active_application) || { sampleCount: 0, lastSeenAt: null };
        current.sampleCount += 1;
        if (!current.lastSeenAt) current.lastSeenAt = sample.captured_at;
        applicationCounts.set(sample.active_application, current);
      }
    }
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
      websiteUsage: Array.from(websiteCounts, ([domain, value]) => ({ domain, ...value }))
        .sort((a, b) => b.durationSeconds - a.durationSeconds).slice(0, 25),
      applicationUsage: Array.from(applicationCounts, ([application, value]) => ({ application, ...value }))
        .sort((a, b) => b.sampleCount - a.sampleCount).slice(0, 25),
      codingUsage: Array.from(codingCounts.values())
        .sort((a, b) => b.durationSeconds - a.durationSeconds).slice(0, 25),
      screenshots: policy?.collect_screenshots ? (screenshotsResult.data || []).map(mapScreenshot) : [],
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
