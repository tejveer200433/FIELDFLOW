export const ACTIVITY_STATUSES = Object.freeze(["active", "idle", "offline", "unreachable", "not_tracking"]);

export function deriveActivityStatus({
  session,
  heartbeat,
  device,
  idleThresholdSeconds = 300,
  unreachableThresholdSeconds = 900,
  now = Date.now()
}) {
  if (!session || session.status !== "active" || session.ended_at) {
    if (device?.status === "active" && device.last_seen_at) {
      const deviceAgeSeconds = Math.max(0, (now - new Date(device.last_seen_at).getTime()) / 1000);
      if (deviceAgeSeconds > unreachableThresholdSeconds) return "unreachable";
    }
    return "not_tracking";
  }
  if (!heartbeat) return "offline";
  const ageSeconds = Math.max(0, (now - new Date(heartbeat.recorded_at).getTime()) / 1000);
  if (heartbeat.online_status === "offline" || heartbeat.online_status === "error" || ageSeconds > idleThresholdSeconds * 2) return "offline";
  if (heartbeat.online_status === "idle") return "idle";
  return "active";
}
