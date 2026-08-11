import { requireActivitySession, ACTIVITY_PERMISSIONS, resolveActivityScope } from "@/backend/activity/auth";
import { enforceActivityRateLimit } from "@/backend/activity/rateLimit";
import { ActivityError, activityFailure, activitySuccess, readActivityJson } from "@/backend/activity/responses";

export const dynamic = "force-dynamic";
const map = row => ({ id: row.id, employeeId: row.employee_id, deviceId: row.device_id, browserName: row.browser_name, extensionId: row.extension_id, extensionVersion: row.extension_version, status: row.status, lastSeenAt: row.last_seen_at, missingSince: row.missing_since, updatedAt: row.updated_at });

export async function GET(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewTeam, ACTIVITY_PERMISSIONS.viewAll, ACTIVITY_PERMISSIONS.managePolicies, ACTIVITY_PERMISSIONS.reviewWebAccess]);
    const scope = await resolveActivityScope(session, { allowSelf: false });
    let query = session.client.from("browser_extension_status").select("*").order("updated_at", { ascending: false }).limit(500);
    if (scope.userIds) query = query.in("employee_id", scope.userIds);
    const { data, error } = await query;
    if (error) throw error;
    return activitySuccess({ statuses: (data || []).map(map) });
  } catch (error) { return activityFailure(error); }
}

export async function POST(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    enforceActivityRateLimit(request, "web-access-extension-health", session.profile.id, { limit: 12, windowMs: 60000 });
    const body = await readActivityJson(request);
    const browserName = String(body.browserName || "").trim().toLowerCase();
    const extensionId = String(body.extensionId || "").trim();
    const extensionVersion = String(body.extensionVersion || "").trim();
    if (!/^[a-z0-9._-]{1,40}$/.test(browserName)) throw new ActivityError("INVALID_BROWSER", "Browser name is invalid.", 400);
    if (extensionId.length > 160 || extensionVersion.length > 40) throw new ActivityError("INVALID_EXTENSION", "Extension identity is invalid.", 400);
    if (!["installed", "disabled", "missing", "unknown"].includes(body.status)) throw new ActivityError("INVALID_EXTENSION_STATUS", "Extension status is invalid.", 400);
    const { data, error } = await session.client.rpc("web_access_report_extension", { p_device_id: body.deviceId, p_browser_name: browserName, p_extension_id: extensionId, p_extension_version: extensionVersion, p_status: body.status, p_seen_at: null });
    if (error) throw error;
    return activitySuccess(map(Array.isArray(data) ? data[0] : data), { status: 201 });
  } catch (error) { return activityFailure(error); }
}
