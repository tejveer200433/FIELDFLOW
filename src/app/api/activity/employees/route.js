import { requireActivitySession, resolveActivityScope, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import { decodeCursor, getActivityProfiles, pageResult } from "@/lib/activity/data";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { activityFailure, activitySuccess } from "@/lib/activity/responses";
import { parseEmployeeFilters } from "@/lib/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const session = await requireActivitySession(request, [
      ACTIVITY_PERMISSIONS.viewSelf,
      ACTIVITY_PERMISSIONS.viewTeam,
      ACTIVITY_PERMISSIONS.viewAll
    ]);
    enforceActivityRateLimit(request, "employees-read", session.profile.id, { limit: 120, windowMs: 60 * 1000 });
    const filters = parseEmployeeFilters(new URL(request.url).searchParams);
    const scope = await resolveActivityScope(session);
    const profiles = await getActivityProfiles(session.client, scope.type === "all" ? null : scope.userIds);
    let filtered = filters.search
      ? profiles.filter(profile => `${profile.name} ${profile.email} ${profile.department}`.toLowerCase().includes(filters.search.toLowerCase()))
      : profiles;
    const employeeIds = filtered.map(item => item.employeeId);
    let devices = [];
    if (employeeIds.length) {
      const { data, error } = await session.client.from("employee_devices")
        .select("employee_id,status,last_seen_at").in("employee_id", employeeIds)
        .order("last_seen_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      devices = data || [];
    }
    const latestDevice = new Map();
    for (const device of devices) if (!latestDevice.has(device.employee_id)) latestDevice.set(device.employee_id, device);
    filtered = filtered.map(profile => ({
      ...profile,
      monitoring: {
        deviceStatus: latestDevice.get(profile.employeeId)?.status || null,
        lastSeenAt: latestDevice.get(profile.employeeId)?.last_seen_at || null
      }
    }));
    const offset = decodeCursor(filters.cursor);
    const page = pageResult(filtered.slice(offset, offset + filters.limit + 1), offset, filters.limit);
    return activitySuccess({ employees: page.data, pagination: page.pagination });
  } catch (error) {
    return activityFailure(error);
  }
}
