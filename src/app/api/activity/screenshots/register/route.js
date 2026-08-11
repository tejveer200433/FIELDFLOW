import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/backend/activity/auth";
import { throwActivityDatabaseError } from "@/backend/activity/data";
import { enforceActivityRateLimit } from "@/backend/activity/rateLimit";
import { activityFailure, activitySuccess, readActivityJson } from "@/backend/activity/responses";
import { parseScreenshotRegistration } from "@/backend/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    enforceActivityRateLimit(request, "screenshot-register", session.profile.id, { limit: 20, windowMs: 5 * 60 * 1000 });
    const body = parseScreenshotRegistration(await readActivityJson(request));
    const { data, error } = await session.client.rpc("activity_register_screenshot", {
      p_tracking_session_id: body.trackingSessionId,
      p_local_sample_id: body.localSampleId,
      p_captured_at: body.capturedAt,
      p_active_application: body.activeApplication,
      p_byte_size: body.byteSize
    });
    if (error) throwActivityDatabaseError(error);
    return activitySuccess(data, { status: 201 });
  } catch (error) {
    return activityFailure(error);
  }
}
