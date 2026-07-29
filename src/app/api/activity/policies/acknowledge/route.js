import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import { rpcRow, throwActivityDatabaseError } from "@/lib/activity/data";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { activityFailure, activitySuccess, readActivityJson } from "@/lib/activity/responses";
import { parsePolicyAcknowledgement } from "@/lib/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    enforceActivityRateLimit(request, "policy-acknowledge", session.profile.id, { limit: 10, windowMs: 60 * 60 * 1000 });
    const body = parsePolicyAcknowledgement(await readActivityJson(request));
    const { data, error } = await session.client.rpc("activity_acknowledge_policy", {
      p_policy_id: body.policyId,
      p_policy_version: body.policyVersion,
      p_acknowledgement_text_hash: body.acknowledgementTextHash
    });
    if (error) throwActivityDatabaseError(error);
    const acknowledgement = rpcRow(data);
    return activitySuccess({
      policyId: acknowledgement.policy_id,
      policyVersion: acknowledgement.policy_version,
      acknowledgedAt: acknowledgement.acknowledged_at
    }, { status: 201, message: "Monitoring policy acknowledged." });
  } catch (error) {
    return activityFailure(error);
  }
}
