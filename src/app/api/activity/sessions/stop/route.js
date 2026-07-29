import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import { mapSession, rpcRow, throwActivityDatabaseError } from "@/lib/activity/data";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { activityFailure, activitySuccess, readActivityJson } from "@/lib/activity/responses";
import { parseSessionStop } from "@/lib/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    enforceActivityRateLimit(request, "session-stop", session.profile.id, { limit: 20, windowMs: 5 * 60 * 1000 });
    const body = parseSessionStop(await readActivityJson(request));
    const { data, error } = await session.client.rpc("activity_stop_session", {
      p_session_id: body.sessionId,
      p_end_source: body.source
    });
    if (error) throwActivityDatabaseError(error);
    const row = rpcRow(data);
    const durationSeconds = Math.max(0, Math.floor((new Date(row.ended_at) - new Date(row.started_at)) / 1000));
    return activitySuccess({
      ...mapSession(row),
      durationSeconds
    }, { message: "Tracking session stopped." });
  } catch (error) {
    return activityFailure(error);
  }
}
