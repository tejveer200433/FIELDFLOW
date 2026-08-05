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

export function groupSamplesBySession(samples) {
  const groups = new Map();
  for (const sample of samples) {
    const sessionId = sample.trackingSessionId;
    if (!sessionId) continue;
    const group = groups.get(sessionId) || [];
    group.push(sample);
    groups.set(sessionId, group);
  }
  return [...groups.entries()].map(([sessionId, sessionSamples]) => ({
    sessionId,
    samples: sessionSamples
  }));
}

export function normalizeUtcTimestamp(value) {
  if (typeof value !== "string") return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function prepareUploadSample(sample) {
  const payload = { ...sample };
  delete payload.trackingSessionId;
  if (Object.hasOwn(payload, "capturedAt")) {
    payload.capturedAt = normalizeUtcTimestamp(payload.capturedAt);
  }
  return payload;
}

async function syncBatch(api, deviceId, sessionId, samples, invokeCommand) {
  const ids = samples.map(sample => sample.localSampleId);
  const uploadSamples = samples.map(prepareUploadSample);
  await invokeCommand("mark_samples_uploading", { ids });
  try {
    const result = await api.ingest({
      deviceId,
      trackingSessionId: sessionId,
      samples: uploadSamples
    });
    const reconciliation = reconcileBatch(samples, result);
    await invokeCommand("apply_sync_result", { result: reconciliation });
    return {
      uploaded: reconciliation.confirmedIds.length,
      rejected: reconciliation.failed.length
    };
  } catch (error) {
    await invokeCommand("release_samples", {
      ids,
      error: error.code || "NETWORK_ERROR",
      retryAfterSeconds: error.retryAfterSeconds || null
    });
    throw error;
  }
}

async function syncWebsiteBatch(api, sessionId, samples, invokeCommand) {
  const ids = samples.map(sample => sample.localSampleId);
  const uploadSamples = samples.map(prepareUploadSample);
  await invokeCommand("mark_website_samples_uploading", { ids });
  try {
    const result = await api.ingestWebsites({
      trackingSessionId: sessionId,
      samples: uploadSamples
    });
    const reconciliation = reconcileBatch(samples, result);
    await invokeCommand("apply_website_sync_result", { result: reconciliation });
    return {
      uploaded: reconciliation.confirmedIds.length,
      rejected: reconciliation.failed.length
    };
  } catch (error) {
    await invokeCommand("release_website_samples", {
      ids,
      error: error.code || "NETWORK_ERROR",
      retryAfterSeconds: error.retryAfterSeconds || null
    });
    throw error;
  }
}

export async function syncPendingSamples(api, deviceId, invokeCommand = invoke) {
  const samples = await invokeCommand("pending_samples", { limit: 100 });
  if (!samples.length) return { uploaded: 0, rejected: 0 };
  const totals = { uploaded: 0, rejected: 0 };
  const errors = [];
  for (const group of groupSamplesBySession(samples)) {
    try {
      const result = await syncBatch(api, deviceId, group.sessionId, group.samples, invokeCommand);
      totals.uploaded += result.uploaded;
      totals.rejected += result.rejected;
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw errors[0];
  return totals;
}

export async function syncPendingWebsiteSamples(api, invokeCommand = invoke) {
  const samples = await invokeCommand("pending_website_samples", { limit: 100 });
  if (!samples.length) return { uploaded: 0, rejected: 0 };
  const totals = { uploaded: 0, rejected: 0 };
  const errors = [];
  for (const group of groupSamplesBySession(samples)) {
    try {
      const result = await syncWebsiteBatch(api, group.sessionId, group.samples, invokeCommand);
      totals.uploaded += result.uploaded;
      totals.rejected += result.rejected;
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw errors[0];
  return totals;
}

async function syncCodingBatch(api, sessionId, samples, invokeCommand) {
  const ids = samples.map(sample => sample.localSampleId);
  const uploadSamples = samples.map(prepareUploadSample);
  await invokeCommand("mark_coding_samples_uploading", { ids });
  try {
    const result = await api.ingestCoding({
      trackingSessionId: sessionId,
      samples: uploadSamples
    });
    const reconciliation = reconcileBatch(samples, result);
    await invokeCommand("apply_coding_sync_result", { result: reconciliation });
    return {
      uploaded: reconciliation.confirmedIds.length,
      rejected: reconciliation.failed.length
    };
  } catch (error) {
    await invokeCommand("release_coding_samples", {
      ids,
      error: error.code || "NETWORK_ERROR",
      retryAfterSeconds: error.retryAfterSeconds || null
    });
    throw error;
  }
}

export async function syncPendingCodingSamples(api, invokeCommand = invoke) {
  const samples = await invokeCommand("pending_coding_samples", { limit: 100 });
  if (!samples.length) return { uploaded: 0, rejected: 0 };
  const totals = { uploaded: 0, rejected: 0 };
  const errors = [];
  for (const group of groupSamplesBySession(samples)) {
    try {
      const result = await syncCodingBatch(api, group.sessionId, group.samples, invokeCommand);
      totals.uploaded += result.uploaded;
      totals.rejected += result.rejected;
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw errors[0];
  return totals;
}

export async function syncAllPending(api, deviceId, invokeCommand = invoke) {
  const totals = { uploaded: 0, rejected: 0 };
  const errors = [];
  for (const operation of [
    () => syncPendingSamples(api, deviceId, invokeCommand),
    () => syncPendingWebsiteSamples(api, invokeCommand),
    () => syncPendingCodingSamples(api, invokeCommand)
  ]) {
    try {
      const result = await operation();
      totals.uploaded += result.uploaded;
      totals.rejected += result.rejected;
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw errors[0];
  return totals;
}
