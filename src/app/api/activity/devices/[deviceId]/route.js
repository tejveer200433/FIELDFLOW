import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/backend/activity/auth";
import { mapDevice, rpcRow, throwActivityDatabaseError } from "@/backend/activity/data";
import { enforceActivityRateLimit } from "@/backend/activity/rateLimit";
import { ActivityError, activityFailure, activitySuccess, readActivityJson } from "@/backend/activity/responses";
import { isUuid, parseDeviceUpdate } from "@/backend/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  try {
    const session = await requireActivitySession(request, [
      ACTIVITY_PERMISSIONS.viewSelf,
      ACTIVITY_PERMISSIONS.managePolicies
    ]);
    await enforceActivityRateLimit(session.client, "device-update", { limit: 20, windowMs: 5 * 60 * 1000 });
    const { deviceId } = await params;
    if (!isUuid(deviceId)) throw new ActivityError("INVALID_DEVICE_ID", "A valid device ID is required.", 400);
    const body = parseDeviceUpdate(await readActivityJson(request));
    if (body.action === "set-screenshot-capture") {
      const { data, error } = await session.client.rpc("activity_set_device_screenshot_capture", {
        p_device_id: deviceId,
        p_enabled: body.screenshotCaptureEnabled
      });
      if (error) throwActivityDatabaseError(error);
      return activitySuccess(data, { message: `Screenshot capture ${body.screenshotCaptureEnabled ? "enabled" : "disabled"} for this device.` });
    }
    if (body.action === "set-corporate-mode" || body.action === "set-standard-mode") {
      const agentMode = body.action === "set-corporate-mode" ? "corporate" : "standard";
      const { data, error } = await session.client.rpc("activity_set_device_management", {
        p_device_id: deviceId,
        p_agent_mode: agentMode
      });
      if (error) throwActivityDatabaseError(error);
      return activitySuccess(mapDevice(rpcRow(data)), {
        message: agentMode === "corporate"
          ? "Corporate Agent controls enabled. The employee can no longer sign out or quit locally."
          : "Standard Agent controls restored."
      });
    }
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
