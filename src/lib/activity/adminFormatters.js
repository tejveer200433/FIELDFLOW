export {
  dateRange,
  formatDateTime,
  formatDuration,
  formatElapsed,
  formatPercentage,
  formatRelativeTime,
  todayUtc
} from "@/lib/activity/teamFormatters";

export function safeAuditSummary(event) {
  if (!event) return "";
  const safe = [];
  if (typeof event.status === "string") safe.push(`Status: ${event.status}`);
  if (typeof event.platform === "string") safe.push(`Platform: ${event.platform}`);
  if (typeof event.policyVersion === "number") safe.push(`Policy version: ${event.policyVersion}`);
  if (typeof event.durationSeconds === "number") safe.push(`Duration: ${event.durationSeconds}s`);
  return safe.join(" · ");
}

export function policyChangeLabel(key) {
  return {
    trackingEnabled: "Monitoring",
    idleThresholdSeconds: "Idle threshold",
    sampleIntervalSeconds: "Sample interval",
    uploadIntervalSeconds: "Upload interval",
    offlineSyncLimitSeconds: "Offline synchronisation limit",
    heartbeatIntervalSeconds: "Heartbeat interval",
    collectApplicationNames: "Application-name collection",
    requireAcknowledgement: "Acknowledgement requirement",
    retentionDays: "Retention period",
    websiteBlockingEnabled: "Website blocking",
    blockedDomains: "Blocked domains",
    collectCodingProjectNames: "Coding project collection"
  }[key] || key;
}
