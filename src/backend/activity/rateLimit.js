import { throwActivityDatabaseError } from "@/backend/activity/data";
import { ActivityError } from "@/backend/activity/responses";

export async function enforceActivityRateLimit(client, bucket, { limit, windowMs }) {
  const { data, error } = await client.rpc("activity_consume_rate_limit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: Math.ceil(windowMs / 1000)
  });
  if (error) throwActivityDatabaseError(error);
  if (!data?.allowed) {
    throw new ActivityError(
      "RATE_LIMITED",
      "Too many activity requests. Try again shortly.",
      429,
      { retryAfterSeconds: Math.max(1, Number(data?.retryAfterSeconds) || 1) }
    );
  }
}
