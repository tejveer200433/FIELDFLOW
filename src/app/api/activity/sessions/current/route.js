import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/backend/activity/auth";
import { readDeviceQuery, getActivePolicy, mapDevice, mapPolicy, mapSession } from "@/backend/activity/data";
import { enforceActivityRateLimit } from "@/backend/activity/rateLimit";
import { activityFailure, activitySuccess } from "@/backend/activity/responses";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    await enforceActivityRateLimit(session.client, "session-current", { limit: 120, windowMs: 60 * 1000 });
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
    const { data: device, error } = await readDeviceQuery(deviceSelect => session.client.from("employee_devices")
      .select(deviceSelect)
      .eq("id", sessionResult.data.device_id).eq("employee_id", session.profile.id).single());
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
