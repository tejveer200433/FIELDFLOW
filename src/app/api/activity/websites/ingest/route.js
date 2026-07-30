import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import { getAcknowledgement, getActivePolicy, requireOwnedSession, throwActivityDatabaseError } from "@/lib/activity/data";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { ActivityError, activityFailure, activitySuccess, readActivityJson } from "@/lib/activity/responses";
import { parseWebsiteSampleBatch } from "@/lib/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    enforceActivityRateLimit(request, "website-ingest", session.profile.id, { limit: 120, windowMs: 60000 });
    const body = parseWebsiteSampleBatch(await readActivityJson(request));
    const [trackingSession, policy] = await Promise.all([
      requireOwnedSession(session.client, session.profile.id, body.trackingSessionId, { active: true }),
      getActivePolicy(session.client)
    ]);
    if (!policy.tracking_enabled) throw new ActivityError("TRACKING_DISABLED", "Activity tracking is disabled.", 409);
    if (policy.require_acknowledgement && !await getAcknowledgement(session.client, session.profile.id, policy)) {
      throw new ActivityError("ACKNOWLEDGEMENT_REQUIRED", "The active monitoring policy must be acknowledged first.", 409);
    }
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
