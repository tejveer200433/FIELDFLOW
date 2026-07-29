import { invoke } from "@tauri-apps/api/core";

export function buildSample({
  localSampleId,
  sessionId,
  capturedAt,
  counts,
  idleSeconds,
  activeApplication,
  screenLocked,
  collectApplicationNames
}) {
  return {
    localSampleId,
    trackingSessionId: sessionId,
    capturedAt,
    keyboardEventCount: counts.keyboardEventCount,
    mouseEventCount: counts.mouseEventCount,
    idleSeconds: Math.min(86_400, Math.max(0, Math.floor(idleSeconds))),
    activeApplication: collectApplicationNames ? activeApplication : null,
    screenLocked: Boolean(screenLocked)
  };
}

export async function captureSample(
  { sessionId, collectApplicationNames },
  invokeCommand = invoke,
  shouldEnqueue = () => true
) {
  const screenLocked = await invokeCommand("get_screen_locked");
  const [idleSeconds, counts, activeApplication] = await Promise.all([
    invokeCommand("get_idle_seconds"),
    screenLocked
      ? Promise.resolve({ keyboardEventCount: 0, mouseEventCount: 0 })
      : invokeCommand("take_input_activity_counts"),
    collectApplicationNames && !screenLocked
      ? invokeCommand("get_active_application")
      : Promise.resolve(null)
  ]);
  const sample = buildSample({
    localSampleId: crypto.randomUUID(),
    sessionId,
    capturedAt: new Date().toISOString(),
    counts,
    idleSeconds,
    activeApplication,
    screenLocked,
    collectApplicationNames
  });
  if (!shouldEnqueue()) return null;
  await invokeCommand("enqueue_sample", { sample });
  return sample;
}
