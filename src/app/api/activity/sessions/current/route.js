import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import { getActivePolicy, mapDevice, mapPolicy, mapSession } from "@/lib/activity/data";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { activityFailure, activitySuccess } from "@/lib/activity/responses";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    enforceActivityRateLimit(request, "session-current", session.profile.id, { limit: 120, windowMs: 60 * 1000 });
    const [sessionResult, policy] = await Promise.all([
      session.client.from("tracking_sessions")
        .select("id,employee_id,device_id,project_id,task_id,started_at,ended_at,status,start_source,end_source")
        .eq("employee_id", session.profile.id).eq("status", "active").is("ended_at", null).maybeSingle(),
      getActivePolicy(session.client, { required: false })
    ]);
    if (sessionResult.error) throw sessionResult.error;
    if (!sessionResult.data) {
      return activitySuccess({ active: false, session: null, policy: mapPolicy(policy), serverTime: new Date().toISOString() });
    }
    const { data: device, error } = await session.client.from("employee_devices")
      .select("id,employee_id,device_name,platform,operating_system_version,agent_version,status,registered_at,last_seen_at,revoked_at")
      .eq("id", sessionResult.data.device_id).single();
    if (error) throw error;
    return activitySuccess({
      active: true,
      session: mapSession(sessionResult.data),
      device: mapDevice(device),
      policy: mapPolicy(policy),
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    return activityFailure(error);
  }
}
