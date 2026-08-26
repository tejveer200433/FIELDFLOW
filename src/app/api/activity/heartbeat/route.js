import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/backend/activity/auth";
import { getActivePolicy, requireOwnedDevice, rpcRow, throwActivityDatabaseError } from "@/backend/activity/data";
import { enforceActivityRateLimit } from "@/backend/activity/rateLimit";
import { activityFailure, activitySuccess, readActivityJson } from "@/backend/activity/responses";
import { parseHeartbeat } from "@/backend/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    await enforceActivityRateLimit(session.client, "heartbeat", { limit: 12, windowMs: 60 * 1000 });
    const body = parseHeartbeat(await readActivityJson(request));
    const device = await requireOwnedDevice(session.client, session.profile.id, body.deviceId);
    const { data, error } = await session.client.rpc("activity_record_heartbeat", {
      p_device_id: body.deviceId,
      p_tracking_session_id: body.trackingSessionId,
      p_agent_version: body.agentVersion,
      p_online_status: body.onlineStatus,
      p_battery_level: body.batteryLevel
    });
    if (error) throwActivityDatabaseError(error);
    if (body.integrity) {
      const { error: integrityError } = await session.client.rpc("activity_record_integrity_report", {
        p_device_id: body.deviceId,
        p_tracking_session_id: body.trackingSessionId,
        p_client_observed_at: body.integrity.observedAt,
        p_executable_sha256: body.integrity.executableSha256
      });
      if (integrityError) throwActivityDatabaseError(integrityError);
    }
    const [heartbeat, policy] = [rpcRow(data), await getActivePolicy(session.client, { required: false })];
    const { data: effectiveWebPolicy, error: effectiveWebPolicyError } = await session.client.rpc("web_access_effective_policy", {
      p_employee_id: session.profile.id,
      p_device_id: body.deviceId
    });
    if (effectiveWebPolicyError && effectiveWebPolicyError.code !== "PGRST202") throw effectiveWebPolicyError;
    const { data: screenshotSetting, error: screenshotSettingError } = await session.client
      .from("device_screenshot_settings")
      .select("capture_enabled")
      .eq("device_id", body.deviceId)
      .eq("employee_id", session.profile.id)
      .maybeSingle();
    if (screenshotSettingError) throw screenshotSettingError;
    const collectScreenshots = Boolean(policy?.collect_screenshots) && screenshotSetting?.capture_enabled !== false;
    let activeOverrides = [];
    if (policy?.website_blocking_enabled) {
      const { data: overrides, error: overrideError } = await session.client
        .from("website_block_override_requests")
        .select("domain,override_ends_at")
        .eq("employee_id", session.profile.id)
        .eq("status", "Approved")
        .gt("override_ends_at", new Date().toISOString());
      if (overrideError) throw overrideError;
      activeOverrides = (overrides || []).map(item => ({ domain: item.domain, overrideEndsAt: item.override_ends_at }));
    }
    return activitySuccess({
      recordedAt: heartbeat.recorded_at,
      nextHeartbeatSeconds: policy?.heartbeat_interval_seconds || 60,
      deviceStatus: device.status,
      trackingEnabled: Boolean(policy?.tracking_enabled),
      websiteBlockingEnabled: Boolean(policy?.website_blocking_enabled),
      blockedDomains: policy?.website_blocking_enabled ? (policy?.blocked_domains || []) : [],
      activeOverrides,
      webAccessPolicy: effectiveWebPolicy || null,
      collectScreenshots,
      screenshotIntervalSeconds: policy?.screenshot_interval_seconds || 240,
      screenshotExcludedApps: collectScreenshots ? (policy?.screenshot_excluded_apps || []) : []
    }, { status: 201 });
  } catch (error) {
    return activityFailure(error);
  }
}
