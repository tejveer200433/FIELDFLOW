import { CONFIG } from "./config.js";
import { detectBrowserName } from "./browser-detection.mjs";

const extensionApi = globalThis.browser ?? globalThis.chrome;
const STATUS_KEY = "fieldflowWebsiteStatus";
const SAMPLE_ALARM = "fieldflow-domain-sample";
const BLOCK_RULE_PREFIX = 1000;
let browserChangeTimer;
let lastQueuedDomain = null;
let detectedBrowserName;
let currentBlockRuleIds = [];

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

function activeBlockedDomains(blocklist) {
  const overridden = new Set((blocklist.overrides || [])
    .filter(item => new Date(item.overrideEndsAt).getTime() > Date.now())
    .map(item => item.domain));
  return (blocklist.blockedDomains || []).filter(domain => !overridden.has(domain));
}

// Fetches the current blocklist + any manager-approved overrides from the desktop
// agent's local bridge and syncs them into declarativeNetRequest dynamic rules. This is
// the only place the extension learns about blocking policy -- it never talks to the
// FieldFlow API directly, only to the already-authenticated desktop agent.
async function refreshBlockingRules() {
  if (!extensionApi.declarativeNetRequest) return;
  let domains = [];
  try {
    const response = await fetch(`${CONFIG.bridgeUrl}/v1/blocklist`);
    if (response.ok) domains = activeBlockedDomains(await response.json());
    else console.warn("FieldFlow: blocklist fetch not ok", response.status);
  } catch (error) {
    console.error("FieldFlow: blocklist fetch failed", error);
    return;
  }
  const addRules = domains.map((domain, index) => ({
    id: BLOCK_RULE_PREFIX + index,
    priority: 1,
    action: {
      type: "redirect",
      redirect: { extensionPath: `/blocked.html?domain=${encodeURIComponent(domain)}` }
    },
    condition: { requestDomains: [domain], resourceTypes: ["main_frame"] }
  }));
  try {
    await extensionApi.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: currentBlockRuleIds,
      addRules
    });
    currentBlockRuleIds = addRules.map(rule => rule.id);
    console.log("FieldFlow: blocking rules updated", addRules);
  } catch (error) {
    console.error("FieldFlow: updateDynamicRules failed", error, addRules);
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
refreshBlockingRules().catch(() => {});
extensionApi.runtime.onInstalled.addListener(() => {
  ensureSamplingAlarm().catch(() => {});
  refreshBlockingRules().catch(() => {});
  sampleAfterBrowserChange();
});
extensionApi.runtime.onStartup.addListener(() => {
  ensureSamplingAlarm().catch(() => {});
  refreshBlockingRules().catch(() => {});
  sampleAfterBrowserChange();
});
extensionApi.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === SAMPLE_ALARM) {
    sampleActiveWebsite().catch(() => {});
    refreshBlockingRules().catch(() => {});
  }
});
extensionApi.tabs.onActivated.addListener(sampleAfterBrowserChange);
extensionApi.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.status === "complete")) sampleAfterBrowserChange();
});
extensionApi.windows.onFocusChanged.addListener(windowId => {
  if (windowId !== extensionApi.windows.WINDOW_ID_NONE) sampleAfterBrowserChange();
});
