import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/backend/activity/auth";
import { activityFailure, activitySuccess, ActivityError } from "@/backend/activity/responses";
import { enforceActivityRateLimit } from "@/backend/activity/rateLimit";
import { parseScreenshotSignedUrlQuery } from "@/backend/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const session = await requireActivitySession(request, [
      ACTIVITY_PERMISSIONS.viewSelf,
      ACTIVITY_PERMISSIONS.viewTeam,
      ACTIVITY_PERMISSIONS.viewAll
    ]);
    await enforceActivityRateLimit(session.client, "screenshot-signed-url", { limit: 60, windowMs: 60 * 1000 });
    const { path } = parseScreenshotSignedUrlQuery(new URL(request.url).searchParams);
    const { data: screenshot, error: lookupError } = await session.client
      .from("activity_screenshots").select("id,employee_id").eq("storage_path", path).maybeSingle();
    if (lookupError) throw lookupError;
    if (!screenshot) throw new ActivityError("SCREENSHOT_NOT_FOUND", "The screenshot was not found in your activity scope.", 404);
    const { data, error } = await session.client.storage.from("activity-screenshots").createSignedUrl(path, 300);
    if (error) throw error;
    // Oversight: record that this viewer opened another employee's screenshot.
    // Best-effort and non-blocking -- never fails the view if logging is denied.
    if (screenshot.employee_id && screenshot.employee_id !== session.profile.id) {
      try {
        await session.client.rpc("activity_log_read_access", {
          p_employee_id: screenshot.employee_id,
          p_action: "screenshot.viewed",
          p_entity_type: "activity_screenshot",
          p_entity_id: screenshot.id,
          p_metadata: {}
        });
      } catch { /* best-effort oversight log; never block the response */ }
    }
    return activitySuccess({ url: data.signedUrl });
  } catch (error) {
    return activityFailure(error);
  }
}
