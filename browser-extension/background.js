/* global chrome */
import { CONFIG } from "./config.js";

const STATUS_KEY = "fieldflowWebsiteStatus";
const SAMPLE_ALARM = "fieldflow-domain-sample";
let browserChangeTimer;
let lastQueuedDomain = null;

async function setStatus(state, message, domain = null) {
  await chrome.storage.local.set({
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
  const response = await fetch(`${CONFIG.bridgeUrl}/v1/domain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, browserName: CONFIG.browserName, durationSeconds })
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
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
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
  const existing = await chrome.alarms.get(SAMPLE_ALARM);
  if (!existing) {
    await chrome.alarms.create(SAMPLE_ALARM, { delayInMinutes: 1, periodInMinutes: 1 });
  }
}

function sampleAfterBrowserChange() {
  clearTimeout(browserChangeTimer);
  browserChangeTimer = setTimeout(() => {
    sampleActiveWebsite({ durationSeconds: 1, requireDomainChange: true }).catch(() => {});
  }, 500);
}

ensureSamplingAlarm().catch(() => {});
chrome.runtime.onInstalled.addListener(() => {
  ensureSamplingAlarm().catch(() => {});
  sampleAfterBrowserChange();
});
chrome.runtime.onStartup.addListener(() => {
  ensureSamplingAlarm().catch(() => {});
  sampleAfterBrowserChange();
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === SAMPLE_ALARM) sampleActiveWebsite().catch(() => {});
});
chrome.tabs.onActivated.addListener(sampleAfterBrowserChange);
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.status === "complete")) sampleAfterBrowserChange();
});
chrome.windows.onFocusChanged.addListener(windowId => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) sampleAfterBrowserChange();
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "fieldflow-check-now") return false;
  sampleActiveWebsite({ durationSeconds: 1 }).then(sendResponse);
  return true;
});
