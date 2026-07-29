import { requireActivitySession, ACTIVITY_PERMISSIONS } from "@/lib/activity/auth";
import {
  getAcknowledgement,
  getActivePolicy,
  requireOwnedDevice,
  requireOwnedSession,
  throwActivityDatabaseError,
  writeActivityAudit
} from "@/lib/activity/data";
import { enforceActivityRateLimit } from "@/lib/activity/rateLimit";
import { ActivityError, activityFailure, activitySuccess, readActivityJson } from "@/lib/activity/responses";
import { parseSampleBatch } from "@/lib/activity/validation.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  let session;
  try {
    session = await requireActivitySession(request, [ACTIVITY_PERMISSIONS.viewSelf]);
    enforceActivityRateLimit(request, "sample-ingest", session.profile.id, { limit: 120, windowMs: 60 * 1000 });
    const body = parseSampleBatch(await readActivityJson(request));
    const [device, trackingSession, policy] = await Promise.all([
      requireOwnedDevice(session.client, session.profile.id, body.deviceId, { active: true }),
      requireOwnedSession(session.client, session.profile.id, body.trackingSessionId, { active: true }),
      getActivePolicy(session.client)
    ]);
    if (trackingSession.device_id !== device.id) {
      throw new ActivityError("SESSION_DEVICE_MISMATCH", "The tracking session does not belong to this device.", 409);
    }
    if (!policy.tracking_enabled) throw new ActivityError("TRACKING_DISABLED", "Activity tracking is disabled.", 409);
    if (policy.require_acknowledgement && !await getAcknowledgement(session.client, session.profile.id, policy)) {
      throw new ActivityError("ACKNOWLEDGEMENT_REQUIRED", "The active monitoring policy must be acknowledged first.", 409);
    }

    const now = Date.now();
    const earliest = now - policy.offline_sync_limit_seconds * 1000;
    const sessionStart = new Date(trackingSession.started_at).getTime();
    const rejected = [];
    const valid = [];
    for (const sample of body.samples) {
      const captured = new Date(sample.capturedAt).getTime();
      let reason = null;
      if (captured > now + 5 * 60 * 1000) reason = "FUTURE_TIMESTAMP";
      else if (captured < sessionStart) reason = "BEFORE_SESSION_START";
      else if (trackingSession.ended_at && captured > new Date(trackingSession.ended_at).getTime()) reason = "AFTER_SESSION_END";
      else if (captured < earliest) reason = "OFFLINE_SYNC_EXPIRED";
      else if (!policy.collect_application_names && sample.activeApplication) reason = "APPLICATION_COLLECTION_DISABLED";
      if (reason) rejected.push({ localSampleId: sample.localSampleId, reason });
      else valid.push(sample);
    }

    let duplicateIds = new Set();
    if (valid.length) {
      const { data: duplicates, error } = await session.client.from("activity_samples")
        .select("local_sample_id")
        .eq("device_id", device.id)
        .in("local_sample_id", valid.map(item => item.localSampleId));
      if (error) throw error;
      duplicateIds = new Set((duplicates || []).map(item => item.local_sample_id));
    }
    const pending = valid.filter(item => !duplicateIds.has(item.localSampleId));
    let ingestion = {
      acceptedCount: 0,
      duplicateCount: 0,
      rejectedCount: 0,
      rejected: [],
      serverTime: new Date().toISOString()
    };
    if (pending.length) {
      const { data, error } = await session.client.rpc("activity_ingest_samples", {
        p_device_id: device.id,
        p_tracking_session_id: trackingSession.id,
        p_samples: pending
      });
      if (error) throwActivityDatabaseError(error);
      ingestion = data || ingestion;
    }
    if (valid.length) {
      const summaryDates = valid.map(sample => sample.capturedAt.slice(0, 10)).sort();
      const { error } = await session.client.rpc("activity_refresh_daily_summaries", {
        p_start_date: summaryDates[0],
        p_end_date: summaryDates.at(-1)
      });
      if (error) throwActivityDatabaseError(error);
    }
    const combinedRejected = [...rejected, ...(ingestion.rejected || [])];
    return activitySuccess({
      acceptedCount: ingestion.acceptedCount || 0,
      duplicateCount: duplicateIds.size + (ingestion.duplicateCount || 0),
      rejectedCount: combinedRejected.length,
      rejected: combinedRejected,
      serverTime: ingestion.serverTime || new Date().toISOString()
    });
  } catch (error) {
    if (session && ["FORBIDDEN_FIELD", "INVALID_BATCH_SIZE", "FUTURE_TIMESTAMP"].includes(error?.code)) {
      await writeActivityAudit(session.client, {
        employeeId: session.profile.id,
        action: "ingest.rejected",
        entityType: "activity_sample",
        metadata: { reason: error.code }
      }).catch(() => {});
    }
    return activityFailure(error);
  }
}
