import { ActivityError } from "@/lib/activity/responses";

// Version 1 limiter: process-local and replaceable. It reduces accidental or
// single-instance abuse but is not sufficient for multi-instance production.
const stores = globalThis.__fieldflowActivityRateLimits || new Map();
globalThis.__fieldflowActivityRateLimits = stores;

function requestAddress(request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

export function enforceActivityRateLimit(request, bucket, identity, { limit, windowMs }) {
  const now = Date.now();
  const key = `${bucket}:${identity || requestAddress(request)}`;
  const current = stores.get(key);
  const entry = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : current;
  entry.count += 1;
  stores.set(key, entry);

  if (stores.size > 5000) {
    for (const [storedKey, stored] of stores) if (stored.resetAt <= now) stores.delete(storedKey);
  }

  if (entry.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    throw new ActivityError(
      "RATE_LIMITED",
      "Too many activity requests. Try again shortly.",
      429,
      { retryAfterSeconds }
    );
  }
}
