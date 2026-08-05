import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import { requireOwnedSession, throwActivityDatabaseError } from "@/lib/activity/data";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { activityFailure, activitySuccess, readActivityJson } from "@/lib/activity/responses";
import { parseCodingSampleBatch } from "@/lib/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    enforceActivityRateLimit(request, "coding-ingest", session.profile.id, { limit: 120, windowMs: 60000 });
    const body = parseCodingSampleBatch(await readActivityJson(request));
    const trackingSession = await requireOwnedSession(
      session.client,
      session.profile.id,
      body.trackingSessionId
    );
    const { data, error } = await session.client.rpc("activity_ingest_coding_samples", {
      p_tracking_session_id: trackingSession.id,
      p_samples: body.samples
    });
    if (error) throwActivityDatabaseError(error);
    return activitySuccess(data);
  } catch (error) {
    return activityFailure(error);
  }
}
