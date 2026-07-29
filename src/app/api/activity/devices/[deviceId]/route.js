import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import { mapDevice, rpcRow, throwActivityDatabaseError } from "@/lib/activity/data";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { ActivityError, activityFailure, activitySuccess, readActivityJson } from "@/lib/activity/responses";
import { isUuid, parseDeviceUpdate } from "@/lib/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  try {
    const session = await requireActivitySession(request, [
      ACTIVITY_PERMISSIONS.viewSelf,
      ACTIVITY_PERMISSIONS.managePolicies
    ]);
    enforceActivityRateLimit(request, "device-update", session.profile.id, { limit: 20, windowMs: 5 * 60 * 1000 });
    const { deviceId } = await params;
    if (!isUuid(deviceId)) throw new ActivityError("INVALID_DEVICE_ID", "A valid device ID is required.", 400);
    const body = parseDeviceUpdate(await readActivityJson(request));
    const { data, error } = await session.client.rpc("activity_update_device", {
      p_device_id: deviceId,
      p_action: body.action,
      p_agent_version: body.agentVersion
    });
    if (error) throwActivityDatabaseError(error);
    return activitySuccess(mapDevice(rpcRow(data)), { message: "Device updated." });
  } catch (error) {
    return activityFailure(error);
  }
}
