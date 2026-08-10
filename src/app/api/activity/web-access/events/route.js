import { requireActivitySession, ACTIVITY_PERMISSIONS, resolveActivityScope } from "@/lib/activity/auth";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { activityFailure, activitySuccess, readActivityJson } from "@/lib/activity/responses";
import { parseWebAccessEvent } from "@/lib/activity/webAccess.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewTeam, ACTIVITY_PERMISSIONS.viewAll, ACTIVITY_PERMISSIONS.managePolicies, ACTIVITY_PERMISSIONS.reviewWebAccess]);
    const scope = await resolveActivityScope(session, { allowSelf: false });
    let query = session.client.from("web_access_events").select("id,employee_id,device_id,event_type,resource_type,resource_key,metadata,occurred_at").order("occurred_at", { ascending: false }).limit(500);
    if (scope.userIds) query = query.in("employee_id", scope.userIds);
    const { data, error } = await query;
    if (error) throw error;
    return activitySuccess({ events: data || [] });
  } catch (error) { return activityFailure(error); }
}

export async function POST(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    enforceActivityRateLimit(request, "web-access-event-create", session.profile.id, { limit: 120, windowMs: 60000 });
    const body = parseWebAccessEvent(await readActivityJson(request));
    const { data, error } = await session.client.rpc("web_access_record_event", { p_device_id: body.deviceId, p_event_type: body.eventType, p_resource_type: body.resourceType, p_resource_key: body.resourceKey });
    if (error) throw error;
    return activitySuccess({ id: data }, { status: 201 });
  } catch (error) { return activityFailure(error); }
}
