import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import { throwActivityDatabaseError } from "@/lib/activity/data";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { ActivityError, activityFailure, activitySuccess, readActivityJson } from "@/lib/activity/responses";
import { parseScreenshotDeletion } from "@/lib/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.managePolicies]);
    enforceActivityRateLimit(request, "screenshot-delete", session.profile.id, { limit: 10, windowMs: 5 * 60 * 1000 });
    const { screenshotIds } = parseScreenshotDeletion(await readActivityJson(request));
    const { data: screenshots, error: lookupError } = await session.client
      .from("activity_screenshots")
      .select("id,storage_path")
      .in("id", screenshotIds);
    if (lookupError) throw lookupError;
    if ((screenshots || []).length !== screenshotIds.length) {
      throw new ActivityError("SCREENSHOT_NOT_FOUND", "One or more screenshots were not found in your authorised scope.", 404);
    }

    const paths = screenshots.map(screenshot => screenshot.storage_path);
    const { error: storageError } = await session.client.storage.from("activity-screenshots").remove(paths);
    if (storageError) {
      throw new ActivityError("SCREENSHOT_DELETE_FAILED", "Screenshot storage deletion failed. No history records were removed.", 502);
    }

    const { data, error } = await session.client.rpc("activity_delete_screenshot_records", {
      p_ids: screenshotIds
    });
    if (error) throwActivityDatabaseError(error);
    return activitySuccess(data, { message: `${data.deletedCount} screenshot${data.deletedCount === 1 ? "" : "s"} deleted.` });
  } catch (error) {
    return activityFailure(error);
  }
}
