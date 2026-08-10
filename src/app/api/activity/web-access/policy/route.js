import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import { requireOwnedDevice } from "@/lib/activity/data";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { ActivityError, activityFailure, activitySuccess } from "@/lib/activity/responses";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    enforceActivityRateLimit(request, "web-access-policy-read", session.profile.id, { limit: 12, windowMs: 60000 });
    const deviceId = new URL(request.url).searchParams.get("deviceId");
    if (!deviceId) throw new ActivityError("Device id is required.", "VALIDATION_FAILED", 400);
    await requireOwnedDevice(session.client, session.profile.id, deviceId);
    const { data, error } = await session.client.rpc("web_access_effective_policy", {
      p_employee_id: session.profile.id,
      p_device_id: deviceId
    });
    if (error) throw error;
    return activitySuccess(data || null);
  } catch (error) {
    return activityFailure(error);
  }
}
