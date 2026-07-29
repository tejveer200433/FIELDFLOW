export class ActivityValidationError extends Error {
  constructor(message, code = "INVALID_REQUEST") {
    super(message);
    this.name = "ActivityValidationError";
    this.code = code;
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const localIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const hashPattern = /^[A-Fa-f0-9]{64,128}$/;
const forbiddenKeys = new Set([
  "employeeId", "employee_id", "managerId", "manager_id", "role", "permissions",
  "permission", "organisationId", "organizationId", "deviceIdentifierHash",
  "device_identifier_hash", "keystrokes", "keys", "keyNames", "keyCodes",
  "typedText", "text", "clipboard", "clipboardContent", "screenshot", "screenshots",
  "mouseCoordinates", "coordinates", "token", "accessToken", "serviceRoleKey"
]);

function fail(message, code) {
  throw new ActivityValidationError(message, code);
}

function object(value, allowed, label = "Request body") {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be a JSON object.`);
  for (const key of Object.keys(value)) {
    if (forbiddenKeys.has(key)) fail(`The field "${key}" is not accepted.`, "FORBIDDEN_FIELD");
    if (!allowed.includes(key)) fail(`Unknown field "${key}".`, "UNKNOWN_FIELD");
  }
  return value;
}

function string(value, label, { min = 1, max = 255, nullable = false } = {}) {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string") fail(`${label} must be a string.`);
  const result = value.trim();
  if (result.length < min || result.length > max) fail(`${label} must be between ${min} and ${max} characters.`);
  return result;
}

function optionalString(value, label, options) {
  return value === undefined || value === null || value === "" ? null : string(value, label, options);
}

function uuid(value, label, nullable = false) {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string" || !uuidPattern.test(value)) fail(`${label} must be a valid UUID.`);
  return value.toLowerCase();
}

function enumeration(value, label, values, fallback) {
  const result = value === undefined ? fallback : value;
  if (!values.includes(result)) fail(`${label} must be one of: ${values.join(", ")}.`);
  return result;
}

function integer(value, label, min, max, fallback) {
  const result = value === undefined ? fallback : value;
  if (!Number.isInteger(result) || result < min || result > max) fail(`${label} must be an integer from ${min} to ${max}.`);
  return result;
}

function boolean(value, label, fallback) {
  const result = value === undefined ? fallback : value;
  if (typeof result !== "boolean") fail(`${label} must be true or false.`);
  return result;
}

function timestamp(value, label) {
  if (typeof value !== "string" || !value.endsWith("Z")) fail(`${label} must be a UTC timestamp ending in Z.`);
  const time = Date.parse(value);
  if (!Number.isFinite(time)) fail(`${label} must be a valid UTC timestamp.`);
  return new Date(time).toISOString();
}

function date(value, label, nullable = false) {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    fail(`${label} must use YYYY-MM-DD format.`);
  }
  return value;
}

export function parseDeviceRegistration(value) {
  const body = object(value, ["deviceName", "platform", "operatingSystemVersion", "agentVersion", "deviceIdentifier"]);
  return {
    deviceName: string(body.deviceName, "deviceName", { min: 2, max: 160 }),
    platform: enumeration(body.platform, "platform", ["windows", "macos", "linux", "other"]),
    operatingSystemVersion: optionalString(body.operatingSystemVersion, "operatingSystemVersion", { max: 160 }),
    agentVersion: string(body.agentVersion, "agentVersion", { max: 80 }),
    deviceIdentifier: string(body.deviceIdentifier, "deviceIdentifier", { min: 8, max: 1024 })
  };
}

export function parseDeviceUpdate(value) {
  const body = object(value, ["action", "agentVersion"]);
  return {
    action: enumeration(body.action, "action", ["revoke", "reactivate", "update-agent"]),
    agentVersion: body.action === "update-agent"
      ? string(body.agentVersion, "agentVersion", { max: 80 })
      : optionalString(body.agentVersion, "agentVersion", { max: 80 })
  };
}

export function parseSessionStart(value) {
  const body = object(value, ["deviceId", "projectId", "taskId", "source"]);
  return {
    deviceId: uuid(body.deviceId, "deviceId"),
    projectId: uuid(body.projectId, "projectId", true),
    taskId: uuid(body.taskId, "taskId", true),
    source: enumeration(body.source, "source", ["agent", "web", "manual", "api"], "agent")
  };
}

export function parseSessionStop(value) {
  const body = object(value, ["sessionId", "source"]);
  return {
    sessionId: uuid(body.sessionId, "sessionId"),
    source: enumeration(body.source, "source", ["agent", "web", "manual", "api", "timeout"], "agent")
  };
}

export function parseSampleBatch(value) {
  const body = object(value, ["deviceId", "trackingSessionId", "samples"]);
  if (!Array.isArray(body.samples) || body.samples.length < 1 || body.samples.length > 100) {
    fail("samples must contain between 1 and 100 items.", "INVALID_BATCH_SIZE");
  }
  const seen = new Set();
  const samples = body.samples.map((item, index) => {
    const sample = object(item, [
      "localSampleId", "capturedAt", "keyboardEventCount", "mouseEventCount",
      "idleSeconds", "activeApplication", "screenLocked"
    ], `samples[${index}]`);
    const localSampleId = string(sample.localSampleId, `samples[${index}].localSampleId`, { max: 120 });
    if (!localIdPattern.test(localSampleId)) fail(`samples[${index}].localSampleId has an invalid format.`);
    if (seen.has(localSampleId)) fail(`Duplicate localSampleId "${localSampleId}" in this batch.`, "DUPLICATE_BATCH_ID");
    seen.add(localSampleId);
    return {
      localSampleId,
      capturedAt: timestamp(sample.capturedAt, `samples[${index}].capturedAt`),
      keyboardEventCount: integer(sample.keyboardEventCount, `samples[${index}].keyboardEventCount`, 0, 1000000, 0),
      mouseEventCount: integer(sample.mouseEventCount, `samples[${index}].mouseEventCount`, 0, 1000000, 0),
      idleSeconds: integer(sample.idleSeconds, `samples[${index}].idleSeconds`, 0, 86400, 0),
      activeApplication: optionalString(sample.activeApplication, `samples[${index}].activeApplication`, { max: 255 }),
      screenLocked: boolean(sample.screenLocked, `samples[${index}].screenLocked`, false)
    };
  });
  return {
    deviceId: uuid(body.deviceId, "deviceId"),
    trackingSessionId: uuid(body.trackingSessionId, "trackingSessionId"),
    samples
  };
}

export function parseHeartbeat(value) {
  const body = object(value, ["deviceId", "trackingSessionId", "agentVersion", "onlineStatus", "batteryLevel"]);
  return {
    deviceId: uuid(body.deviceId, "deviceId"),
    trackingSessionId: uuid(body.trackingSessionId, "trackingSessionId", true),
    agentVersion: string(body.agentVersion, "agentVersion", { max: 80 }),
    onlineStatus: enumeration(body.onlineStatus, "onlineStatus", ["online", "idle", "offline", "error"]),
    batteryLevel: body.batteryLevel === undefined || body.batteryLevel === null
      ? null
      : integer(body.batteryLevel, "batteryLevel", 0, 100)
  };
}

export function parsePolicyAcknowledgement(value) {
  const body = object(value, ["policyId", "policyVersion", "acknowledgementTextHash"]);
  const acknowledgementTextHash = string(body.acknowledgementTextHash, "acknowledgementTextHash", { min: 64, max: 128 });
  if (!hashPattern.test(acknowledgementTextHash)) fail("acknowledgementTextHash must be a hexadecimal SHA-256 or SHA-512 hash.");
  return {
    policyId: uuid(body.policyId, "policyId"),
    policyVersion: integer(body.policyVersion, "policyVersion", 1, 2147483647),
    acknowledgementTextHash
  };
}

export function parsePolicyAdministration(value) {
  const body = object(value, [
    "trackingEnabled", "idleThresholdSeconds", "sampleIntervalSeconds",
    "uploadIntervalSeconds", "offlineSyncLimitSeconds", "heartbeatIntervalSeconds",
    "collectApplicationNames", "requireAcknowledgement", "retentionDays"
  ]);
  return {
    trackingEnabled: boolean(body.trackingEnabled, "trackingEnabled", false),
    idleThresholdSeconds: integer(body.idleThresholdSeconds, "idleThresholdSeconds", 30, 86400, 300),
    sampleIntervalSeconds: integer(body.sampleIntervalSeconds, "sampleIntervalSeconds", 10, 3600, 60),
    uploadIntervalSeconds: integer(body.uploadIntervalSeconds, "uploadIntervalSeconds", 30, 86400, 300),
    offlineSyncLimitSeconds: integer(body.offlineSyncLimitSeconds, "offlineSyncLimitSeconds", 0, 2592000, 86400),
    heartbeatIntervalSeconds: integer(body.heartbeatIntervalSeconds, "heartbeatIntervalSeconds", 15, 3600, 60),
    collectApplicationNames: boolean(body.collectApplicationNames, "collectApplicationNames", false),
    requireAcknowledgement: boolean(body.requireAcknowledgement, "requireAcknowledgement", true),
    retentionDays: integer(body.retentionDays, "retentionDays", 1, 3650, 90)
  };
}

function queryObject(searchParams, allowed) {
  const result = {};
  for (const [key, value] of searchParams.entries()) {
    if (!allowed.includes(key)) fail(`Unknown query parameter "${key}".`, "UNKNOWN_FIELD");
    result[key] = value;
  }
  return result;
}

function pagination(query, max = 100) {
  const limit = query.limit === undefined ? 25 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > max) fail(`limit must be an integer from 1 to ${max}.`);
  const cursor = query.cursor === undefined ? null : string(query.cursor, "cursor", { max: 200 });
  return { limit, cursor };
}

export function parseDeviceFilters(searchParams) {
  const query = queryObject(searchParams, ["employeeId", "status", "limit", "cursor"]);
  return {
    employeeId: uuid(query.employeeId, "employeeId", true),
    status: query.status ? enumeration(query.status, "status", ["pending", "active", "revoked"]) : null,
    ...pagination(query)
  };
}

export function parseTeamFilters(searchParams) {
  const query = queryObject(searchParams, ["status", "employeeId", "date", "limit", "cursor", "sort"]);
  return {
    status: query.status ? enumeration(query.status, "status", ["active", "idle", "offline", "not_tracking"]) : null,
    employeeId: uuid(query.employeeId, "employeeId", true),
    date: date(query.date, "date", true),
    sort: enumeration(query.sort, "sort", ["name", "last_seen", "activity"], "name"),
    ...pagination(query)
  };
}

export function parseEmployeeFilters(searchParams, detailed = false) {
  const allowed = detailed
    ? ["startDate", "endDate", "limit", "cursor"]
    : ["search", "limit", "cursor"];
  const query = queryObject(searchParams, allowed);
  if (detailed) {
    const startDate = date(query.startDate, "startDate", true);
    const endDate = date(query.endDate, "endDate", true);
    if (startDate && endDate && endDate < startDate) fail("endDate cannot be earlier than startDate.");
    return { startDate, endDate, ...pagination(query, 90) };
  }
  return {
    search: optionalString(query.search, "search", { max: 120 }),
    ...pagination(query)
  };
}

export function isUuid(value) {
  return typeof value === "string" && uuidPattern.test(value);
}
