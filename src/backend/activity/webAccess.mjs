import { ActivityValidationError } from "./validation.mjs";

const RESOURCE_TYPES = new Set(["domain", "application", "category"]);
const REQUEST_SCOPES = new Set(["once", "shift", "project", "seven_days", "always"]);
const SCOPE_TYPES = new Set(["organisation", "team", "role", "employee", "device"]);
const EVENT_TYPES = new Set(["domain_blocked", "application_blocked", "policy_applied"]);

function text(value, name, maximum = 253) {
  const result = String(value || "").trim();
  if (!result || result.length > maximum) throw new ActivityValidationError(`${name} is invalid.`);
  return result;
}

function stringList(value, name, maximum = 100) {
  if (!Array.isArray(value) || value.length > maximum) throw new ActivityValidationError(`${name} is invalid.`);
  return [...new Set(value.map(item => text(item, name).toLowerCase()))];
}

export function normalizeResourceKey(type, value) {
  const key = text(value, "Resource").toLowerCase();
  if (type === "domain") {
    const hostname = key.replace(/^https?:\/\//, "").split(/[/?#]/)[0].replace(/^www\./, "").replace(/\.$/, "");
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(hostname)) {
      throw new ActivityValidationError("Enter a valid website domain.");
    }
    return hostname;
  }
  if (!/^[a-z0-9][a-z0-9 ._-]{0,119}$/.test(key)) throw new ActivityValidationError("Enter a valid application or category name.");
  return key;
}

export function parseWebAccessRequest(value = {}) {
  const resourceType = String(value.resourceType || "domain");
  if (!RESOURCE_TYPES.has(resourceType)) throw new ActivityValidationError("Resource type is invalid.");
  const requestedScope = String(value.requestedScope || "once");
  if (!REQUEST_SCOPES.has(requestedScope)) throw new ActivityValidationError("Requested access scope is invalid.");
  const requestedMinutes = Number(value.requestedMinutes || 30);
  if (!Number.isInteger(requestedMinutes) || requestedMinutes < 5 || requestedMinutes > 10080) throw new ActivityValidationError("Requested minutes must be between 5 and 10080.");
  return {
    resourceType,
    resourceKey: normalizeResourceKey(resourceType, value.resourceKey),
    reason: text(value.reason, "Reason", 500),
    requestedMinutes,
    requestedScope,
    deviceId: value.deviceId || null,
    projectId: value.projectId || null,
    taskId: value.taskId || null
  };
}

export function parseWebAccessReview(value = {}) {
  const decision = String(value.decision || "");
  if (!["Approved", "Rejected"].includes(decision)) throw new ActivityValidationError("Decision is invalid.");
  const approvalScope = String(value.approvalScope || "once");
  if (decision === "Approved" && !REQUEST_SCOPES.has(approvalScope)) throw new ActivityValidationError("Approval scope is invalid.");
  const grantedMinutes = value.grantedMinutes == null ? null : Number(value.grantedMinutes);
  if (decision === "Approved" && approvalScope === "once" && (!Number.isInteger(grantedMinutes) || grantedMinutes < 5 || grantedMinutes > 10080)) {
    throw new ActivityValidationError("Granted minutes must be between 5 and 10080.");
  }
  return { id: text(value.id, "Request id", 80), decision, approvalScope, grantedMinutes, comment: String(value.comment || "").trim().slice(0, 500) };
}

export function parseWebAccessRule(value = {}) {
  const scopeType = String(value.scopeType || "organisation");
  if (!SCOPE_TYPES.has(scopeType)) throw new ActivityValidationError("Policy scope is invalid.");
  const suppliedScopeIds = Array.isArray(value.scopeIds) ? value.scopeIds : value.scopeId ? [value.scopeId] : [];
  const scopeIds = scopeType === "organisation" ? [] : [...new Set(suppliedScopeIds.map(item => text(item, "Policy scope id", 80)))];
  if (scopeType !== "organisation" && !scopeIds.length) throw new ActivityValidationError("Select at least one policy target.");
  if (scopeIds.length > 100) throw new ActivityValidationError("A policy can target at most 100 employees or roles at once.");
  if (!["employee", "role"].includes(scopeType) && scopeIds.length > 1) throw new ActivityValidationError("This policy scope accepts one target.");
  const scopeId = scopeIds[0] || null;
  const priority = Number(value.priority ?? 100);
  if (!Number.isInteger(priority) || priority < 0 || priority > 10000) throw new ActivityValidationError("Priority must be between 0 and 10000.");
  const scheduleDays = Array.isArray(value.scheduleDays) ? [...new Set(value.scheduleDays.map(Number))] : [0,1,2,3,4,5,6];
  if (!scheduleDays.length || scheduleDays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new ActivityValidationError("Schedule days are invalid.");
  const scheduleTime = input => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(input || "")) ? `${input}:00` : (() => { throw new ActivityValidationError("Schedule time is invalid."); })();
  return {
    name: text(value.name, "Policy name", 120), scopeType, scopeId, scopeIds,
    enforcementEnabled: value.enforcementEnabled !== false,
    enabled: value.enabled !== false,
    priority,
    blockedCategories: stringList(value.blockedCategories || [], "Blocked categories", 30),
    blockedDomains: stringList(value.blockedDomains || [], "Blocked domains").map(item => normalizeResourceKey("domain", item)),
    allowedDomains: stringList(value.allowedDomains || [], "Allowed domains").map(item => normalizeResourceKey("domain", item)),
    blockedApplications: stringList(value.blockedApplications || [], "Blocked applications").map(item => normalizeResourceKey("application", item)),
    scheduleTimezone: text(value.scheduleTimezone || "UTC", "Schedule timezone", 80),
    scheduleDays,
    scheduleStart: scheduleTime(value.scheduleStart || "00:00"),
    scheduleEnd: scheduleTime(value.scheduleEnd || "23:59"),
    requireManagedExtension: value.requireManagedExtension !== false
  };
}

export function parseWebAccessEvent(value = {}) {
  const eventType = String(value.eventType || "");
  if (!EVENT_TYPES.has(eventType)) throw new ActivityValidationError("Event type is invalid.");
  const resourceType = eventType === "application_blocked" ? "application" : eventType === "domain_blocked" ? "domain" : "policy";
  return { eventType, resourceType, resourceKey: normalizeResourceKey(resourceType === "policy" ? "application" : resourceType, value.resourceKey), deviceId: value.deviceId || null };
}
