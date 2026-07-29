import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import { getActivePolicy, mapPolicy, mapSession, rpcRow, throwActivityDatabaseError } from "@/lib/activity/data";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { activityFailure, activitySuccess, readActivityJson } from "@/lib/activity/responses";
import { parseSessionStart } from "@/lib/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    enforceActivityRateLimit(request, "session-start", session.profile.id, { limit: 20, windowMs: 5 * 60 * 1000 });
    const body = parseSessionStart(await readActivityJson(request));
    const { data, error } = await session.client.rpc("activity_start_session", {
      p_device_id: body.deviceId,
      p_project_id: body.projectId,
      p_task_id: body.taskId,
      p_start_source: body.source
    });
    if (error) throwActivityDatabaseError(error);
    const policy = await getActivePolicy(session.client);
    return activitySuccess({
      ...mapSession(rpcRow(data)),
      policy: mapPolicy(policy)
    }, { status: 201, message: "Tracking session started." });
  } catch (error) {
    return activityFailure(error);
  }
}
