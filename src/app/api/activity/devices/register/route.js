import { createHash } from "node:crypto";
import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import { getAcknowledgement, mapDevice, mapPolicy, rpcRow, throwActivityDatabaseError, getActivePolicy } from "@/lib/activity/data";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { activityFailure, activitySuccess, readActivityJson } from "@/lib/activity/responses";
import { parseDeviceRegistration } from "@/lib/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    enforceActivityRateLimit(request, "device-register", session.profile.id, { limit: 5, windowMs: 60 * 60 * 1000 });
    const body = parseDeviceRegistration(await readActivityJson(request));
    const deviceHash = createHash("sha256").update(body.deviceIdentifier, "utf8").digest("hex");
    const { data, error } = await session.client.rpc("activity_register_device", {
      p_device_name: body.deviceName,
      p_platform: body.platform,
      p_operating_system_version: body.operatingSystemVersion,
      p_agent_version: body.agentVersion,
      p_device_identifier_hash: deviceHash
    });
    if (error) throwActivityDatabaseError(error);
    const policy = await getActivePolicy(session.client, { required: false });
    const acknowledgement = await getAcknowledgement(session.client, session.profile.id, policy);
    return activitySuccess({
      ...mapDevice(rpcRow(data)),
      policy: mapPolicy(policy),
      acknowledgementRequired: Boolean(policy?.require_acknowledgement && !acknowledgement)
    }, { status: 201, message: "Device registration completed." });
  } catch (error) {
    return activityFailure(error);
  }
}
