import { ActivityError } from "@/lib/activity/responses";

export const policySelect = "id,policy_version,is_active,tracking_enabled,idle_threshold_seconds,sample_interval_seconds,upload_interval_seconds,offline_sync_limit_seconds,heartbeat_interval_seconds,collect_application_names,require_acknowledgement,retention_days,created_at,updated_at";

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
    retentionDays: row.retention_days
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
    ["administration required", "ACCESS_DENIED", 403]
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
