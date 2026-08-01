/* global chrome */
import { CONFIG } from "./config.js";

const SESSION_KEY = "fieldflowSession";
const STATUS_KEY = "fieldflowWebsiteStatus";
const SAMPLE_ALARM = "fieldflow-domain-sample";
let browserChangeTimer;
let lastUploadedDomain = null;

async function setStatus(state, message, domain = null) {
  await chrome.storage.local.set({
    [STATUS_KEY]: { state, message, domain, checkedAt: new Date().toISOString() }
  });
}

async function session() {
  const stored = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY];
  if (!stored?.accessToken) return null;
  if (stored.expiresAt > Date.now() + 60000) return stored;
  const response = await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: CONFIG.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: stored.refreshToken })
  });
  if (!response.ok) {
    await chrome.storage.session.remove(SESSION_KEY);
    return null;
  }
  const refreshed = await response.json();
  const value = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAt: Date.now() + refreshed.expires_in * 1000
  };
  await chrome.storage.session.set({ [SESSION_KEY]: value });
  return value;
}

async function fieldFlow(path, token, init = {}) {
  const response = await fetch(`${CONFIG.fieldFlowUrl}/api/activity${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  });
  return { response, payload: await response.json().catch(() => ({})) };
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

async function sampleActiveWebsite({ durationSeconds = CONFIG.sampleSeconds, requireDomainChange = false } = {}) {
  try {
    const auth = await session();
    if (!auth) return setStatus("signed-out", "Sign in to the extension.");
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) return setStatus("no-tab", "No active browser tab was found.");
    if (tab.incognito) return setStatus("private-tab", "Private tabs are never collected.");
    const domain = hostnameOnly(tab.url);
    if (!domain) return setStatus("unsupported-tab", "Open a normal http or https website.");
    if (requireDomainChange && domain === lastUploadedDomain) {
      return { success: true, skipped: true, domain };
    }
    const current = await fieldFlow("/sessions/current", auth.accessToken);
    if (!current.response.ok) {
      return setStatus("session-error", current.payload?.error?.message || `Session check failed (${current.response.status}).`, domain);
    }
    const trackingSessionId = current.payload?.data?.session?.sessionId;
    if (!current.payload?.data?.active || !trackingSessionId) {
      return setStatus("not-tracking", "Start tracking in the FieldFlow desktop agent first.", domain);
    }
    const uploaded = await fieldFlow("/websites/ingest", auth.accessToken, {
      method: "POST",
      body: JSON.stringify({
        trackingSessionId,
        samples: [{
          localSampleId: crypto.randomUUID(),
          capturedAt: new Date().toISOString(),
          domain,
          browserName: CONFIG.browserName,
          durationSeconds
        }]
      })
    });
    if (!uploaded.response.ok || uploaded.payload?.success === false) {
      return setStatus("upload-error", uploaded.payload?.error?.message || `Upload failed (${uploaded.response.status}).`, domain);
    }
    lastUploadedDomain = domain;
    await setStatus("uploaded", `Uploaded ${domain}.`, domain);
    return { success: true, domain };
  } catch (error) {
    await setStatus("connection-error", `Connection failed: ${error?.message || "unknown error"}`);
    return { success: false };
  }
}

async function ensureSamplingAlarm() {
  const existing = await chrome.alarms.get(SAMPLE_ALARM);
  if (!existing) {
    await chrome.alarms.create(SAMPLE_ALARM, {
      delayInMinutes: 1,
      periodInMinutes: 1
    });
  }
}

function sampleAfterBrowserChange() {
  clearTimeout(browserChangeTimer);
  browserChangeTimer = setTimeout(() => {
    sampleActiveWebsite({ durationSeconds: 1, requireDomainChange: true }).catch(() => {});
  }, 500);
}

// A service worker can restart at any time. Check for the alarm without
// recreating an existing one, because recreating it postpones its next run.
ensureSamplingAlarm().catch(() => {});
chrome.runtime.onInstalled.addListener(() => {
  ensureSamplingAlarm().catch(() => {});
  sampleActiveWebsite({ durationSeconds: 1 }).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  ensureSamplingAlarm().catch(() => {});
  sampleAfterBrowserChange();
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === SAMPLE_ALARM) sampleActiveWebsite().catch(() => {});
});
chrome.tabs.onActivated.addListener(() => {
  sampleAfterBrowserChange();
});
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.status === "complete")) {
    sampleAfterBrowserChange();
  }
});
chrome.windows.onFocusChanged.addListener(windowId => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) sampleAfterBrowserChange();
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "fieldflow-check-now") return false;
  sampleActiveWebsite({ durationSeconds: 1 }).then(sendResponse);
  return true;
});
