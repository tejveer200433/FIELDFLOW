import { assertActivityEmployee, requireActivitySession, resolveActivityScope, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import { decodeCursor, getActivePolicy, getActivityProfiles, pageResult } from "@/lib/activity/data";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { activityFailure, activitySuccess } from "@/lib/activity/responses";
import { deriveActivityStatus } from "@/lib/activity/status.mjs";
import { parseTeamFilters } from "@/lib/activity/validation.mjs";

export const dynamic = "force-dynamic";

function firstByEmployee(rows) {
  const map = new Map();
  for (const row of rows || []) if (!map.has(row.employee_id)) map.set(row.employee_id, row);
  return map;
}

export async function GET(request) {
  try {
    const session = await requireActivitySession(request, [
      ACTIVITY_PERMISSIONS.viewTeam,
      ACTIVITY_PERMISSIONS.viewAll
    ]);
    enforceActivityRateLimit(request, "team-read", session.profile.id, { limit: 120, windowMs: 60 * 1000 });
    const filters = parseTeamFilters(new URL(request.url).searchParams);
    const scope = await resolveActivityScope(session, { allowSelf: false });
    if (filters.employeeId) assertActivityEmployee(scope, filters.employeeId);
    const requestedIds = filters.employeeId
      ? [filters.employeeId]
      : scope.type === "all" ? null : scope.userIds;
    const profiles = await getActivityProfiles(session.client, requestedIds);
    const employeeIds = profiles.map(item => item.employeeId);
    if (!employeeIds.length) return activitySuccess({ employees: [], pagination: { limit: filters.limit, nextCursor: null } });

    const summaryDate = filters.date || new Date().toISOString().slice(0, 10);
    const [devicesResult, sessionsResult, heartbeatsResult, summariesResult, samplesResult, policy] = await Promise.all([
      session.client.from("employee_devices")
        .select("id,employee_id,status,last_seen_at").in("employee_id", employeeIds)
        .order("last_seen_at", { ascending: false, nullsFirst: false }),
      session.client.from("tracking_sessions")
        .select("id,employee_id,device_id,started_at,ended_at,status")
        .in("employee_id", employeeIds).eq("status", "active").is("ended_at", null)
        .order("started_at", { ascending: false }),
      session.client.from("agent_heartbeats")
        .select("employee_id,device_id,tracking_session_id,recorded_at,online_status")
        .in("employee_id", employeeIds).order("recorded_at", { ascending: false }).limit(Math.min(2000, employeeIds.length * 10)),
      session.client.from("activity_daily_summaries")
        .select("employee_id,tracked_seconds,active_seconds,idle_seconds,activity_percentage")
        .in("employee_id", employeeIds).eq("summary_date", summaryDate),
      session.client.from("activity_samples")
        .select("employee_id,tracking_session_id,captured_at,idle_seconds,active_application")
        .in("employee_id", employeeIds).order("captured_at", { ascending: false }).limit(Math.min(2000, employeeIds.length * 10)),
      getActivePolicy(session.client, { required: false })
    ]);
    const failure = [devicesResult, sessionsResult, heartbeatsResult, summariesResult, samplesResult].find(result => result.error);
    if (failure) throw failure.error;

    const devices = firstByEmployee(devicesResult.data);
    const sessions = firstByEmployee(sessionsResult.data);
    const heartbeats = firstByEmployee(heartbeatsResult.data);
    const summaries = new Map((summariesResult.data || []).map(row => [row.employee_id, row]));
    const samples = firstByEmployee(samplesResult.data);
    let rows = profiles.map(profile => {
      const device = devices.get(profile.employeeId);
      const activeSession = sessions.get(profile.employeeId);
      const heartbeat = heartbeats.get(profile.employeeId);
      const sample = samples.get(profile.employeeId);
      const summary = summaries.get(profile.employeeId);
      return {
        employeeId: profile.employeeId,
        employeeName: profile.name,
        currentStatus: deriveActivityStatus({
          session: activeSession,
          heartbeat,
          idleThresholdSeconds: policy?.idle_threshold_seconds || 300
        }),
        activeSessionId: activeSession?.id || null,
        deviceStatus: device?.status || null,
        activeApplication: policy?.collect_application_names ? sample?.active_application || null : null,
        idleSeconds: sample?.idle_seconds || 0,
        lastSeenAt: heartbeat?.recorded_at || device?.last_seen_at || null,
        trackedSecondsToday: summary?.tracked_seconds || 0,
        activeSecondsToday: summary?.active_seconds || 0,
        idleSecondsToday: summary?.idle_seconds || 0,
        activityPercentage: Number(summary?.activity_percentage || 0)
      };
    });
    if (filters.status) rows = rows.filter(row => row.currentStatus === filters.status);
    rows.sort((a, b) => {
      if (filters.sort === "last_seen") return String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || ""));
      if (filters.sort === "activity") return b.activityPercentage - a.activityPercentage;
      return a.employeeName.localeCompare(b.employeeName);
    });
    const offset = decodeCursor(filters.cursor);
    const page = pageResult(rows.slice(offset, offset + filters.limit + 1), offset, filters.limit);
    return activitySuccess({ employees: page.data, date: summaryDate, pagination: page.pagination });
  } catch (error) {
    return activityFailure(error);
  }
}
