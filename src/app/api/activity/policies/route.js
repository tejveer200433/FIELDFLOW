import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import { getAcknowledgement, getActivePolicy, mapPolicy, rpcRow, throwActivityDatabaseError } from "@/lib/activity/data";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { activityFailure, activitySuccess, readActivityJson } from "@/lib/activity/responses";
import { parsePolicyAdministration } from "@/lib/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const session = await requireActivitySession(request);
    enforceActivityRateLimit(request, "policy-read", session.profile.id, { limit: 120, windowMs: 60 * 1000 });
    const policy = await getActivePolicy(session.client);
    const acknowledgement = await getAcknowledgement(session.client, session.profile.id, policy);
    return activitySuccess({
      ...mapPolicy(policy),
      acknowledgementStatus: acknowledgement
        ? { acknowledged: true, acknowledgedAt: acknowledgement.acknowledged_at }
        : { acknowledged: false, acknowledgedAt: null }
    });
  } catch (error) {
    return activityFailure(error);
  }
}

export async function POST(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.managePolicies]);
    enforceActivityRateLimit(request, "policy-update", session.profile.id, { limit: 10, windowMs: 60 * 60 * 1000 });
    const body = parsePolicyAdministration(await readActivityJson(request));
    const { data, error } = await session.client.rpc("activity_activate_policy", {
      p_tracking_enabled: body.trackingEnabled,
      p_idle_threshold_seconds: body.idleThresholdSeconds,
      p_sample_interval_seconds: body.sampleIntervalSeconds,
      p_upload_interval_seconds: body.uploadIntervalSeconds,
      p_offline_sync_limit_seconds: body.offlineSyncLimitSeconds,
      p_heartbeat_interval_seconds: body.heartbeatIntervalSeconds,
      p_collect_application_names: body.collectApplicationNames,
      p_require_acknowledgement: body.requireAcknowledgement,
      p_retention_days: body.retentionDays,
      p_website_blocking_enabled: body.websiteBlockingEnabled,
      p_blocked_domains: body.blockedDomains,
      p_collect_coding_project_names: body.collectCodingProjectNames
    });
    if (error) throwActivityDatabaseError(error);
    return activitySuccess(mapPolicy(rpcRow(data)), { status: 201, message: "A new monitoring policy version is active." });
  } catch (error) {
    return activityFailure(error);
  }
}
