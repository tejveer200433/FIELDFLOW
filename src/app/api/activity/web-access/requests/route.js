import { activityCan, requireActivitySession, ACTIVITY_PERMISSIONS, resolveActivityScope } from "@/lib/activity/auth";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { activityFailure, activitySuccess, readActivityJson } from "@/lib/activity/responses";
import { parseWebAccessRequest, parseWebAccessReview } from "@/lib/activity/webAccess.mjs";

export const dynamic = "force-dynamic";
const select = "id,employee_id,device_id,resource_type,resource_key,reason,project_id,task_id,requested_minutes,requested_scope,status,granted_minutes,approval_scope,access_starts_at,access_ends_at,reviewer_comment,reviewed_by,reviewed_at,created_at";
const map = row => ({ id: row.id, employeeId: row.employee_id, deviceId: row.device_id, resourceType: row.resource_type, resourceKey: row.resource_key, reason: row.reason, projectId: row.project_id, taskId: row.task_id, requestedMinutes: row.requested_minutes, requestedScope: row.requested_scope, status: row.status, grantedMinutes: row.granted_minutes, approvalScope: row.approval_scope, accessStartsAt: row.access_starts_at, accessEndsAt: row.access_ends_at, reviewerComment: row.reviewer_comment, reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at, createdAt: row.created_at });

export async function GET(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf, ACTIVITY_PERMISSIONS.viewTeam, ACTIVITY_PERMISSIONS.viewAll, ACTIVITY_PERMISSIONS.managePolicies, ACTIVITY_PERMISSIONS.reviewWebAccess]);
    enforceActivityRateLimit(request, "web-access-requests-read", session.profile.id, { limit: 120, windowMs: 60000 });
    const canReview = session.access.isOwner || activityCan(session.access, ACTIVITY_PERMISSIONS.managePolicies) || activityCan(session.access, ACTIVITY_PERMISSIONS.viewTeam) || session.access.permissions.includes("activity.web_access.review");
    let query = session.client.from("web_access_requests").select(select).order("created_at", { ascending: false }).limit(250);
    if (!canReview) query = query.eq("employee_id", session.profile.id);
    else {
      const scope = await resolveActivityScope(session);
      if (scope.userIds) query = query.in("employee_id", scope.userIds);
    }
    const { data, error } = await query;
    if (error) throw error;
    return activitySuccess({ requests: (data || []).map(map), canReview });
  } catch (error) { return activityFailure(error); }
}

export async function POST(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    enforceActivityRateLimit(request, "web-access-request-create", session.profile.id, { limit: 10, windowMs: 3600000 });
    const body = parseWebAccessRequest(await readActivityJson(request));
    const { data, error } = await session.client.from("web_access_requests").insert({ employee_id: session.profile.id, device_id: body.deviceId, resource_type: body.resourceType, resource_key: body.resourceKey, reason: body.reason, project_id: body.projectId, task_id: body.taskId, requested_minutes: body.requestedMinutes, requested_scope: body.requestedScope }).select(select).single();
    if (error) throw error;
    return activitySuccess(map(data), { status: 201, message: "Access request submitted." });
  } catch (error) { return activityFailure(error); }
}

export async function PATCH(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewTeam, ACTIVITY_PERMISSIONS.viewAll, ACTIVITY_PERMISSIONS.managePolicies, ACTIVITY_PERMISSIONS.reviewWebAccess]);
    enforceActivityRateLimit(request, "web-access-request-review", session.profile.id, { limit: 120, windowMs: 3600000 });
    const body = parseWebAccessReview(await readActivityJson(request));
    const { data, error } = await session.client.rpc("web_access_review_request", { p_request_id: body.id, p_decision: body.decision, p_granted_minutes: body.grantedMinutes, p_approval_scope: body.approvalScope, p_comment: body.comment });
    if (error) throw error;
    return activitySuccess(map(Array.isArray(data) ? data[0] : data), { message: `Request ${body.decision.toLowerCase()}.` });
  } catch (error) { return activityFailure(error); }
}
