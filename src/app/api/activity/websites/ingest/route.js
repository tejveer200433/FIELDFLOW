import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/backend/activity/auth";
import { requireOwnedSession, throwActivityDatabaseError } from "@/backend/activity/data";
import { enforceActivityRateLimit } from "@/backend/activity/rateLimit";
import { activityFailure, activitySuccess, readActivityJson } from "@/backend/activity/responses";
import { parseWebsiteSampleBatch } from "@/backend/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    await enforceActivityRateLimit(session.client, "website-ingest", { limit: 120, windowMs: 60000 });
    const body = parseWebsiteSampleBatch(await readActivityJson(request));
    const trackingSession = await requireOwnedSession(
      session.client,
      session.profile.id,
      body.trackingSessionId
    );
    const { data, error } = await session.client.rpc("activity_ingest_website_samples", {
      p_tracking_session_id: trackingSession.id,
      p_samples: body.samples
    });
    if (error) throwActivityDatabaseError(error);
    return activitySuccess(data);
  } catch (error) {
    return activityFailure(error);
  }
}
