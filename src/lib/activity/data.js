import { ActivityError } from "@/lib/activity/responses";

export const policySelect = "id,policy_version,is_active,tracking_enabled,idle_threshold_seconds,sample_interval_seconds,upload_interval_seconds,offline_sync_limit_seconds,heartbeat_interval_seconds,collect_application_names,require_acknowledgement,retention_days,website_blocking_enabled,blocked_domains,collect_coding_project_names,collect_screenshots,screenshot_interval_seconds,screenshot_excluded_apps,created_at,updated_at";

export function mapPolicy(row) {
  if (!row) return null;
  return {
    policyId: row.id,
    policyVersion: row.policy_version,
    trackingEnabled: row.tracking_enabled,
    idleThresholdSeconds: row.idle_threshold_seconds,
    sampleIntervalSeconds: row.sample_interval_seconds,
    uploadIntervalSeconds: row.upload_interval_seconds,
    offlineSyncLimitSeconds: row.offline_sync_limit_seconds,
    heartbeatIntervalSeconds: row.heartbeat_interval_seconds,
    collectApplicationNames: row.collect_application_names,
    requireAcknowledgement: row.require_acknowledgement,
    retentionDays: row.retention_days,
    websiteBlockingEnabled: row.website_blocking_enabled,
    blockedDomains: row.blocked_domains || [],
    collectCodingProjectNames: row.collect_coding_project_names,
    collectScreenshots: row.collect_screenshots,
    screenshotIntervalSeconds: row.screenshot_interval_seconds,
    screenshotExcludedApps: row.screenshot_excluded_apps || []
  };
}

export function mapScreenshot(row) {
  return {
    id: row.id,
    capturedAt: row.captured_at,
    storagePath: row.storage_path,
    activeApplication: row.active_application
  };
}

export function mapBlocklistOverrideRequest(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    domain: row.domain,
    reason: row.reason,
    status: row.status,
    requestedMinutes: row.requested_minutes,
    grantedMinutes: row.granted_minutes,
    overrideEndsAt: row.override_ends_at,
    reviewerComment: row.reviewer_comment,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at
  };
}

export function mapDevice(row) {
  return {
    deviceId: row.id,
    employeeId: row.employee_id,
    deviceName: row.device_name,
    platform: row.platform,
    operatingSystemVersion: row.operating_system_version,
    agentVersion: row.agent_version,
    status: row.status,
    registeredAt: row.registered_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at
  };
}

export function mapSession(row) {
  return {
    sessionId: row.id,
    employeeId: row.employee_id,
    deviceId: row.device_id,
    projectId: row.project_id,
    taskId: row.task_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    startSource: row.start_source,
    endSource: row.end_source
  };
}

export async function getActivePolicy(client, { required = true } = {}) {
  const { data, error } = await client.from("monitoring_policies")
    .select(policySelect).eq("is_active", true).maybeSingle();
  if (error) throw error;
  if (!data && required) throw new ActivityError("POLICY_NOT_CONFIGURED", "No active monitoring policy is configured.", 409);
  return data;
}

export async function getAcknowledgement(client, employeeId, policy) {
  if (!policy) return null;
  const { data, error } = await client.from("monitoring_policy_acknowledgements")
    .select("id,acknowledged_at")
    .eq("employee_id", employeeId)
    .eq("policy_id", policy.id)
    .eq("policy_version", policy.policy_version)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function requireOwnedDevice(client, employeeId, deviceId, { active = false } = {}) {
  const { data, error } = await client.from("employee_devices")
    .select("id,employee_id,device_name,platform,operating_system_version,agent_version,status,registered_at,last_seen_at,revoked_at")
    .eq("id", deviceId).eq("employee_id", employeeId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ActivityError("DEVICE_NOT_FOUND", "The device was not found for this employee.", 404);
  if (active && data.status !== "active") {
    throw new ActivityError(data.status === "revoked" ? "DEVICE_REVOKED" : "DEVICE_NOT_ACTIVE", "The device is not active.", 409);
  }
  return data;
}

export async function requireOwnedSession(client, employeeId, sessionId, { active = false } = {}) {
  const { data, error } = await client.from("tracking_sessions")
    .select("id,employee_id,device_id,project_id,task_id,started_at,ended_at,status,start_source,end_source")
    .eq("id", sessionId).eq("employee_id", employeeId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ActivityError("SESSION_NOT_FOUND", "The tracking session was not found.", 404);
  if (active && (data.status !== "active" || data.ended_at)) {
    throw new ActivityError("SESSION_NOT_ACTIVE", "The tracking session is no longer active.", 409);
  }
  return data;
}

export async function writeActivityAudit(client, { employeeId = null, action, entityType, entityId = null, metadata = {} }) {
  const { error } = await client.rpc("activity_write_audit_log", {
    p_employee_id: employeeId,
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_metadata: metadata
  });
  if (error) throw error;
}

export function decodeCursor(cursor) {
  if (!cursor) return 0;
  try {
    const value = Number(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!Number.isInteger(value) || value < 0 || value > 10000000) throw new Error();
    return value;
  } catch {
    throw new ActivityError("INVALID_CURSOR", "The pagination cursor is invalid.", 400);
  }
}

export function pageResult(rows, offset, limit) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return {
    data,
    pagination: {
      limit,
      nextCursor: hasMore ? Buffer.from(String(offset + limit)).toString("base64url") : null
    }
  };
}

export function rpcRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

export function throwActivityDatabaseError(error) {
  const message = String(error?.message || "");
  if (
    error?.code === "PGRST202"
    || (
      /activity_(ingest_samples|refresh_daily_summaries)/i.test(message)
      && /(schema cache|could not find|does not exist)/i.test(message)
    )
  ) {
    throw new ActivityError(
      "DATABASE_MIGRATION_REQUIRED",
      "The activity database migrations are not fully applied.",
      503
    );
  }
  const mappings = [
    ["Device registration unavailable", "DEVICE_UNAVAILABLE", 409],
    ["Device reactivation requires", "DEVICE_REACTIVATION_DENIED", 403],
    ["Device access denied", "DEVICE_OUT_OF_SCOPE", 403],
    ["Device not found", "DEVICE_NOT_FOUND", 404],
    ["Device is revoked", "DEVICE_REVOKED", 409],
    ["Device is not active", "DEVICE_NOT_ACTIVE", 409],
    ["No active monitoring policy", "POLICY_NOT_CONFIGURED", 409],
    ["Activity tracking is disabled", "TRACKING_DISABLED", 409],
    ["acknowledgement required", "ACKNOWLEDGEMENT_REQUIRED", 409],
    ["already acknowledged", "ALREADY_ACKNOWLEDGED", 409],
    ["Active policy version not found", "POLICY_VERSION_NOT_FOUND", 404],
    ["active tracking session already exists", "ACTIVE_SESSION_EXISTS", 409],
    ["Active tracking session not found", "SESSION_NOT_ACTIVE", 409],
    ["Project is not assigned", "PROJECT_OUT_OF_SCOPE", 403],
    ["Task is not assigned", "TASK_OUT_OF_SCOPE", 403],
    ["Tracking session does not match", "SESSION_DEVICE_MISMATCH", 409],
    ["Heartbeat sent too frequently", "HEARTBEAT_TOO_FREQUENT", 429],
    ["administration required", "ACCESS_DENIED", 403],
    ["Coding activity collection is disabled", "CODING_COLLECTION_DISABLED", 409],
    ["Screenshot collection is disabled", "SCREENSHOT_COLLECTION_DISABLED", 409],
    ["Screenshot application is excluded by policy", "EXCLUDED_APPLICATION", 409],
    ["Tracking session is cancelled", "SESSION_NOT_ACTIVE", 409],
    ["Tracking session is unavailable", "SESSION_NOT_ACTIVE", 409],
    ["Tracking session is not active", "SESSION_NOT_ACTIVE", 409],
    ["Tracking session does not match device", "SESSION_DEVICE_MISMATCH", 409],
    ["Session monitoring policy not found", "POLICY_VERSION_NOT_FOUND", 404],
    ["timestamp is in the future", "FUTURE_TIMESTAMP", 400],
    ["predates session start", "BEFORE_SESSION_START", 400],
    ["expired for offline sync", "OFFLINE_SYNC_EXPIRED", 409],
    ["Invalid screenshot size", "INVALID_SAMPLE_VALUE", 400],
    ["Invalid local sample id", "INVALID_LOCAL_SAMPLE_ID", 400]
  ];
  const match = mappings.find(([fragment]) => message.toLowerCase().includes(fragment.toLowerCase()));
  if (match) throw new ActivityError(match[1], match[0], match[2], match[2] === 429 ? { retryAfterSeconds: 5 } : null);
  throw error;
}

export async function getActivityProfiles(client, userIds = null) {
  const { data, error } = await client.rpc("activity_get_employee_profiles", {
    p_user_ids: userIds
  });
  if (error) throw error;
  return (data || []).map(profile => ({
    employeeId: profile.employee_id,
    name: profile.full_name,
    email: profile.email,
    department: profile.department
  }));
}
