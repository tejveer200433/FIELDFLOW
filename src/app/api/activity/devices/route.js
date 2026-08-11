import { assertActivityEmployee, requireActivitySession, resolveActivityScope, ACTIVITY_PERMISSIONS } from "@/backend/activity/auth";
import { decodeCursor, mapDevice, pageResult } from "@/backend/activity/data";
import { enforceActivityRateLimit } from "@/backend/activity/rateLimit";
import { activityFailure, activitySuccess } from "@/backend/activity/responses";
import { parseDeviceFilters } from "@/backend/activity/validation.mjs";

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
    const deviceIds = page.data.map(device => device.id);
    const employeeIds = [...new Set(page.data.map(device => device.employee_id))];
    const [settingsResult, profilesResult] = await Promise.all([
      deviceIds.length
        ? session.client.from("device_screenshot_settings").select("device_id,capture_enabled").in("device_id", deviceIds)
        : Promise.resolve({ data: [], error: null }),
      employeeIds.length
        ? session.client.from("profiles").select("id,full_name,email").in("id", employeeIds)
        : Promise.resolve({ data: [], error: null })
    ]);
    if (settingsResult.error) throw settingsResult.error;
    if (profilesResult.error) throw profilesResult.error;
    const settings = new Map((settingsResult.data || []).map(item => [item.device_id, item.capture_enabled]));
    const profiles = new Map((profilesResult.data || []).map(item => [item.id, item]));
    return activitySuccess({
      devices: page.data.map(device => {
        const profile = profiles.get(device.employee_id);
        return mapDevice(device, {
          employeeName: profile?.full_name,
          employeeEmail: profile?.email,
          screenshotCaptureEnabled: settings.get(device.id) ?? true,
          screenshotCaptureMode: settings.has(device.id) ? "override" : "inherit"
        });
      }),
      pagination: page.pagination
    });
  } catch (error) {
    return activityFailure(error);
  }
}
