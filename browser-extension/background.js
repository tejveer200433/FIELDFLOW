import { CONFIG } from "./config.js";
import { detectBrowserName } from "./browser-detection.mjs";

const extensionApi = globalThis.browser ?? globalThis.chrome;
const STATUS_KEY = "fieldflowWebsiteStatus";
const SAMPLE_ALARM = "fieldflow-domain-sample";
let browserChangeTimer;
let lastQueuedDomain = null;
let detectedBrowserName;

async function setStatus(state, message, domain = null) {
  await extensionApi.storage.local.set({
    [STATUS_KEY]: { state, message, domain, checkedAt: new Date().toISOString() }
  });
}

function hostnameOnly(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.hostname.toLowerCase().replace(/^www\./, "").slice(0, 253);
  } catch {
    return null;
  }
}

async function sendToAgent(domain, durationSeconds) {
  detectedBrowserName ||= await detectBrowserName();
  const response = await fetch(`${CONFIG.bridgeUrl}/v1/domain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, browserName: detectedBrowserName, durationSeconds })
  });
  const result = await response.json().catch(() => ({}));
  if (response.status === 409 || result.state === "not-tracking") {
    await setStatus("not-tracking", "Desktop agent connected, but tracking is not active.", domain);
    return { success: false, state: "not-tracking" };
  }
  if (!response.ok || !result.accepted) {
    await setStatus("agent-error", "The desktop agent could not queue this domain.", domain);
    return { success: false, state: result.state || "agent-error" };
  }
  lastQueuedDomain = domain;
  await setStatus("queued", `Queued ${domain} through the desktop agent.`, domain);
  return { success: true, domain };
}

async function sampleActiveWebsite({ durationSeconds = CONFIG.sampleSeconds, requireDomainChange = false } = {}) {
  try {
    const [tab] = await extensionApi.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) return setStatus("no-tab", "No active browser tab was found.");
    if (tab.incognito) return setStatus("private-tab", "Private tabs are never collected.");
    const domain = hostnameOnly(tab.url);
    if (!domain) return setStatus("unsupported-tab", "Open a normal http or https website.");
    if (requireDomainChange && domain === lastQueuedDomain) {
      return { success: true, skipped: true, domain };
    }
    return await sendToAgent(domain, durationSeconds);
  } catch {
    await setStatus("agent-offline", "Open the FieldFlow desktop agent. No sign-in is required here.");
    return { success: false, state: "agent-offline" };
  }
}

async function ensureSamplingAlarm() {
  const existing = await extensionApi.alarms.get(SAMPLE_ALARM);
  if (!existing) {
    await extensionApi.alarms.create(SAMPLE_ALARM, { delayInMinutes: 1, periodInMinutes: 1 });
  }
}

function sampleAfterBrowserChange() {
  clearTimeout(browserChangeTimer);
  browserChangeTimer = setTimeout(() => {
    sampleActiveWebsite({ durationSeconds: 1, requireDomainChange: true }).catch(() => {});
  }, 500);
}

ensureSamplingAlarm().catch(() => {});
extensionApi.runtime.onInstalled.addListener(() => {
  ensureSamplingAlarm().catch(() => {});
  sampleAfterBrowserChange();
});
extensionApi.runtime.onStartup.addListener(() => {
  ensureSamplingAlarm().catch(() => {});
  sampleAfterBrowserChange();
});
extensionApi.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === SAMPLE_ALARM) sampleActiveWebsite().catch(() => {});
});
extensionApi.tabs.onActivated.addListener(sampleAfterBrowserChange);
extensionApi.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.status === "complete")) sampleAfterBrowserChange();
});
extensionApi.windows.onFocusChanged.addListener(windowId => {
  if (windowId !== extensionApi.windows.WINDOW_ID_NONE) sampleAfterBrowserChange();
});
