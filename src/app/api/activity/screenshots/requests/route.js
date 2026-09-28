import { requireActivitySession, ACTIVITY_PERMISSIONS, resolveActivityScope, assertActivityEmployee } from "@/backend/activity/auth";
import { activityFailure, activitySuccess, ActivityError, readActivityJson } from "@/backend/activity/responses";
import { enforceActivityRateLimit } from "@/backend/activity/rateLimit";
import { rpcRow, throwActivityDatabaseError } from "@/backend/activity/data";
import { parseScreenshotRequest } from "@/backend/activity/validation.mjs";

export const dynamic = "force-dynamic";

async function authorize(request, deviceId) {
  const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.managePolicies]);
  const scope = await resolveActivityScope(session, { allowSelf: false });
  const { data: device, error } = await session.client.from("employee_devices")
    .select("id,employee_id").eq("id", deviceId).maybeSingle();
  if (error) throw error;
  if (!device) throw new ActivityError("DEVICE_NOT_FOUND", "The device was not found in your activity scope.", 404);
  assertActivityEmployee(scope, device.employee_id);
  return session;
}

function mapRequest(row) {
  if (!row) return null;
  return { id: row.id, deviceId: row.device_id, requestedAt: row.requested_at, expiresAt: row.expires_at,
    status: row.status === "pending" && Date.parse(row.expires_at) <= Date.now() ? "expired" : row.status,
    completedAt: row.completed_at, screenshotId: row.screenshot_id };
}

export async function GET(request) {
  try {
    const { deviceId } = parseScreenshotRequest(Object.fromEntries(new URL(request.url).searchParams));
    const session = await authorize(request, deviceId);
    await enforceActivityRateLimit(session.client, "screenshot-request-read", { limit: 240, windowMs: 60_000 });
    const { data, error } = await session.client.from("activity_screenshot_requests").select("*")
      .eq("device_id", deviceId).order("requested_at", { ascending: false }).limit(1).maybeSingle();
    if (error) {
      if (["42P01", "PGRST205"].includes(error.code)) throw new ActivityError("DATABASE_MIGRATION_REQUIRED", "Apply the Android screenshot-request migration to enable this feature.", 503);
      throw error;
    }
    return activitySuccess(mapRequest(data));
  } catch (error) { return activityFailure(error); }
}

export async function POST(request) {
  try {
    const { deviceId } = parseScreenshotRequest(await readActivityJson(request));
    const session = await authorize(request, deviceId);
    await enforceActivityRateLimit(session.client, "screenshot-request-create", { limit: 20, windowMs: 60_000 });
    const { data, error } = await session.client.rpc("activity_request_screenshot", { p_device_id: deviceId });
    if (error) {
      const message = String(error.message || "");
      if (/administration required|out of scope/.test(message)) throw new ActivityError("ACCESS_DENIED", "You cannot request a screenshot from this employee.", 403);
      if (/requires active tracking|disabled by policy|require an Android|cooldown/.test(message)) throw new ActivityError("SCREENSHOT_REQUEST_UNAVAILABLE", message, 409);
      throwActivityDatabaseError(error);
    }
    return activitySuccess(mapRequest(rpcRow(data)), { status: 201, message: "Request sent. The phone needs an approved screen-sharing session; the request expires in five minutes." });
  } catch (error) { return activityFailure(error); }
}
