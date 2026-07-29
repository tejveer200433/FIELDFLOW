import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import { getActivePolicy, requireOwnedDevice, rpcRow, throwActivityDatabaseError } from "@/lib/activity/data";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { activityFailure, activitySuccess, readActivityJson } from "@/lib/activity/responses";
import { parseHeartbeat } from "@/lib/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    enforceActivityRateLimit(request, "heartbeat", session.profile.id, { limit: 12, windowMs: 60 * 1000 });
    const body = parseHeartbeat(await readActivityJson(request));
    const device = await requireOwnedDevice(session.client, session.profile.id, body.deviceId);
    const { data, error } = await session.client.rpc("activity_record_heartbeat", {
      p_device_id: body.deviceId,
      p_tracking_session_id: body.trackingSessionId,
      p_agent_version: body.agentVersion,
      p_online_status: body.onlineStatus,
      p_battery_level: body.batteryLevel
    });
    if (error) throwActivityDatabaseError(error);
    const [heartbeat, policy] = [rpcRow(data), await getActivePolicy(session.client, { required: false })];
    return activitySuccess({
      recordedAt: heartbeat.recorded_at,
      nextHeartbeatSeconds: policy?.heartbeat_interval_seconds || 60,
      deviceStatus: device.status,
      trackingEnabled: Boolean(policy?.tracking_enabled)
    }, { status: 201 });
  } catch (error) {
    return activityFailure(error);
  }
}
