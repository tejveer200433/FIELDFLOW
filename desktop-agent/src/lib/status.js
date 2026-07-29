export function deriveAgentStatus({ online, session, idleSeconds = 0, idleThresholdSeconds = 300 }) {
  if (!online) return "Offline";
  if (!session) return "Not tracking";
  if (idleSeconds >= idleThresholdSeconds) return "Idle";
  return "Tracking";
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
