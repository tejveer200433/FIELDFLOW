import { assertActivityEmployee, requireActivitySession, resolveActivityScope, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import { decodeCursor, mapDevice, pageResult } from "@/lib/activity/data";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { activityFailure, activitySuccess } from "@/lib/activity/responses";
import { parseDeviceFilters } from "@/lib/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const session = await requireActivitySession(request, [
      ACTIVITY_PERMISSIONS.viewSelf,
      ACTIVITY_PERMISSIONS.viewTeam,
      ACTIVITY_PERMISSIONS.viewAll
    ]);
    enforceActivityRateLimit(request, "devices-read", session.profile.id, { limit: 120, windowMs: 60 * 1000 });
    const filters = parseDeviceFilters(new URL(request.url).searchParams);
    const scope = await resolveActivityScope(session);
    const offset = decodeCursor(filters.cursor);
    let query = session.client.from("employee_devices")
      .select("id,employee_id,device_name,platform,operating_system_version,agent_version,status,registered_at,last_seen_at,revoked_at")
      .order("registered_at", { ascending: false })
      .range(offset, offset + filters.limit);
    if (scope.type !== "all") query = query.in("employee_id", scope.userIds);
    if (filters.employeeId) {
      assertActivityEmployee(scope, filters.employeeId);
      query = query.eq("employee_id", filters.employeeId);
    }
    if (filters.status) query = query.eq("status", filters.status);
    const { data, error } = await query;
    if (error) throw error;
    const page = pageResult(data, offset, filters.limit);
    return activitySuccess({ devices: page.data.map(mapDevice), pagination: page.pagination });
  } catch (error) {
    return activityFailure(error);
  }
}
