import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import { activityFailure, activitySuccess, ActivityError } from "@/lib/activity/responses";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { parseScreenshotSignedUrlQuery } from "@/lib/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const session = await requireActivitySession(request, [
      ACTIVITY_PERMISSIONS.viewSelf,
      ACTIVITY_PERMISSIONS.viewTeam,
      ACTIVITY_PERMISSIONS.viewAll
    ]);
    enforceActivityRateLimit(request, "screenshot-signed-url", session.profile.id, { limit: 60, windowMs: 60 * 1000 });
    const { path } = parseScreenshotSignedUrlQuery(new URL(request.url).searchParams);
    const { data: screenshot, error: lookupError } = await session.client
      .from("activity_screenshots").select("id").eq("storage_path", path).maybeSingle();
    if (lookupError) throw lookupError;
    if (!screenshot) throw new ActivityError("SCREENSHOT_NOT_FOUND", "The screenshot was not found in your activity scope.", 404);
    const { data, error } = await session.client.storage.from("activity-screenshots").createSignedUrl(path, 300);
    if (error) throw error;
    return activitySuccess({ url: data.signedUrl });
  } catch (error) {
    return activityFailure(error);
  }
}
