/* global chrome */
import { CONFIG } from "./config.js";

const SESSION_KEY = "fieldflowSession";

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

async function sampleActiveWebsite() {
  const auth = await session();
  if (!auth) return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || tab.incognito) return;
  const domain = hostnameOnly(tab.url);
  if (!domain) return;
  const current = await fieldFlow("/sessions/current", auth.accessToken);
  const trackingSessionId = current.payload?.data?.session?.sessionId;
  if (!current.response.ok || !current.payload?.data?.active || !trackingSessionId) return;
  await fieldFlow("/websites/ingest", auth.accessToken, {
    method: "POST",
    body: JSON.stringify({
      trackingSessionId,
      samples: [{
        localSampleId: crypto.randomUUID(),
        capturedAt: new Date().toISOString(),
        domain,
        browserName: CONFIG.browserName,
        durationSeconds: CONFIG.sampleSeconds
      }]
    })
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("fieldflow-domain-sample", { periodInMinutes: 1 });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("fieldflow-domain-sample", { periodInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "fieldflow-domain-sample") sampleActiveWebsite().catch(() => {});
});
