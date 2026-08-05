import { activityCan, requireActivitySession, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import { mapBlocklistOverrideRequest, rpcRow, throwActivityDatabaseError } from "@/lib/activity/data";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { ActivityError, activityFailure, activitySuccess, readActivityJson } from "@/lib/activity/responses";
import { parseBlocklistOverrideRequest, parseBlocklistOverrideReview } from "@/lib/activity/validation.mjs";

export const dynamic = "force-dynamic";

const requestSelect = "id,employee_id,domain,reason,status,requested_minutes,granted_minutes,override_ends_at,reviewer_comment,reviewed_by,reviewed_at,created_at";

export async function GET(request) {
  try {
    const session = await requireActivitySession(request, [
      ACTIVITY_PERMISSIONS.viewSelf,
      ACTIVITY_PERMISSIONS.managePolicies
    ]);
    enforceActivityRateLimit(request, "blocklist-requests-read", session.profile.id, { limit: 120, windowMs: 60 * 1000 });
    const canReview = activityCan(session.access, ACTIVITY_PERMISSIONS.managePolicies);
    let query = session.client.from("website_block_override_requests")
      .select(requestSelect).order("created_at", { ascending: false }).limit(200);
    if (!canReview) query = query.eq("employee_id", session.profile.id);
    const { data, error } = await query;
    if (error) throw error;
    return activitySuccess({ requests: (data || []).map(mapBlocklistOverrideRequest) });
  } catch (error) {
    return activityFailure(error);
  }
}

export async function POST(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    enforceActivityRateLimit(request, "blocklist-requests-create", session.profile.id, { limit: 10, windowMs: 60 * 60 * 1000 });
    const body = parseBlocklistOverrideRequest(await readActivityJson(request));
    const { data, error } = await session.client.from("website_block_override_requests")
      .insert({
        employee_id: session.profile.id,
        domain: body.domain,
        reason: body.reason,
        requested_minutes: body.requestedMinutes
      })
      .select(requestSelect)
      .single();
    if (error) throw error;
    return activitySuccess(mapBlocklistOverrideRequest(data), { status: 201, message: "Access request submitted." });
  } catch (error) {
    return activityFailure(error);
  }
}

export async function PATCH(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.managePolicies]);
    enforceActivityRateLimit(request, "blocklist-requests-review", session.profile.id, { limit: 60, windowMs: 60 * 60 * 1000 });
    const body = parseBlocklistOverrideReview(await readActivityJson(request));
    const { data, error } = await session.client.rpc("activity_review_blocklist_override", {
      p_request_id: body.id,
      p_decision: body.decision,
      p_granted_minutes: body.grantedMinutes,
      p_comment: body.comment
    });
    if (error) throwActivityDatabaseError(error);
    const row = rpcRow(data);
    if (!row) throw new ActivityError("REQUEST_NOT_FOUND", "The override request was not found.", 404);
    return activitySuccess(mapBlocklistOverrideRequest(row), {
      message: body.decision === "Approved" ? "Temporary access approved." : "Request rejected."
    });
  } catch (error) {
    return activityFailure(error);
  }
}
