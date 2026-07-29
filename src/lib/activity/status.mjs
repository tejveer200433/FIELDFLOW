export const ACTIVITY_STATUSES = Object.freeze(["active", "idle", "offline", "not_tracking"]);

export function deriveActivityStatus({ session, heartbeat, idleThresholdSeconds = 300, now = Date.now() }) {
  if (!session || session.status !== "active" || session.ended_at) return "not_tracking";
  if (!heartbeat) return "offline";
  const ageSeconds = Math.max(0, (now - new Date(heartbeat.recorded_at).getTime()) / 1000);
  if (heartbeat.online_status === "offline" || heartbeat.online_status === "error" || ageSeconds > idleThresholdSeconds * 2) return "offline";
  if (heartbeat.online_status === "idle") return "idle";
  return "active";
}
