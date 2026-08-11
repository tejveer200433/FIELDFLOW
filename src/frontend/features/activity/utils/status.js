export function isHeartbeatStale(recordedAt, heartbeatIntervalSeconds = 60, now = Date.now()) {
  if (!recordedAt) return true;
  const threshold = Math.max(90, (Number(heartbeatIntervalSeconds) || 60) * 3) * 1000;
  return now - new Date(recordedAt).getTime() > threshold;
}

export function deriveMonitoringStatus({ policy, sessionInfo, devices = [], heartbeat, error, now = Date.now() }) {
  if (error) return { key: "error", label: "Tracking error", tone: "rose" };
  if (!policy) return { key: "unavailable", label: "Monitoring unavailable", tone: "slate" };
  if (!policy.trackingEnabled) return { key: "disabled", label: "Monitoring disabled by organisation", tone: "slate" };
  if (policy.requireAcknowledgement && !policy.acknowledgementStatus?.acknowledged) {
    return { key: "acknowledgement", label: "Acknowledgement required", tone: "amber" };
  }
  const activeDevices = devices.filter(device => device.status === "active");
  if (!activeDevices.length) return { key: "unavailable", label: "Monitoring unavailable", tone: "slate" };
  if (sessionInfo?.active) {
    if (
      heartbeat?.onlineStatus === "offline"
      || isHeartbeatStale(heartbeat?.recordedAt, policy.heartbeatIntervalSeconds, now)
    ) {
      return { key: "offline", label: "Device offline", tone: "amber" };
    }
    return { key: "active", label: "Tracking active", tone: "emerald" };
  }
  return { key: "ready", label: "Ready to track", tone: "blue" };
}
