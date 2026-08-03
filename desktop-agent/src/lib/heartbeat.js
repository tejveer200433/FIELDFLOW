const RATE_LIMIT_CODES = new Set(["HEARTBEAT_TOO_FREQUENT", "RATE_LIMITED"]);

export function heartbeatMinimumGapMs(intervalSeconds = 60) {
  const seconds = Number(intervalSeconds) || 60;
  return Math.max(5, seconds - 5) * 1000;
}

export function shouldSendHeartbeat({ lastAttemptAt = 0, now = Date.now(), intervalSeconds = 60 }) {
  return !lastAttemptAt || now - lastAttemptAt >= heartbeatMinimumGapMs(intervalSeconds);
}

export function isHeartbeatRateLimit(error) {
  return error?.status === 429 || RATE_LIMIT_CODES.has(error?.code);
}
