import { invoke } from "@tauri-apps/api/core";

export function reconcileBatch(samples, result) {
  const rejected = new Map((result.rejected || []).map(item => [item.localSampleId, item.reason]));
  return {
    confirmedIds: samples.filter(sample => !rejected.has(sample.localSampleId)).map(sample => sample.localSampleId),
    failed: samples
      .filter(sample => rejected.has(sample.localSampleId))
      .map(sample => ({ id: sample.localSampleId, error: rejected.get(sample.localSampleId) }))
  };
}

export async function syncPendingSamples(api, deviceId, sessionId, invokeCommand = invoke) {
  const samples = await invokeCommand("pending_samples", { trackingSessionId: sessionId, limit: 100 });
  if (!samples.length) return { uploaded: 0, rejected: 0 };
  const ids = samples.map(sample => sample.localSampleId);
  await invokeCommand("mark_samples_uploading", { ids });
  try {
    const result = await api.ingest({ deviceId, trackingSessionId: sessionId, samples });
    const reconciliation = reconcileBatch(samples, result);
    await invokeCommand("apply_sync_result", { result: reconciliation });
    return { uploaded: reconciliation.confirmedIds.length, rejected: reconciliation.failed.length };
  } catch (error) {
    await invokeCommand("release_samples", {
      ids,
      error: error.code || "NETWORK_ERROR",
      retryAfterSeconds: error.retryAfterSeconds || null
    });
    throw error;
  }
}
