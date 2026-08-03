/* global chrome */
import { CONFIG } from "./config.js";

const STATUS_KEY = "fieldflowWebsiteStatus";
const status = document.querySelector("#status");
const connection = document.querySelector("#connection");

async function render() {
  try {
    const response = await fetch(`${CONFIG.bridgeUrl}/v1/status`);
    const result = await response.json();
    connection.textContent = result.tracking
      ? "Desktop agent connected · Tracking active"
      : "Desktop agent connected · Tracking not active";
  } catch {
    connection.textContent = "Desktop agent not connected";
  }
  const latest = (await chrome.storage.local.get(STATUS_KEY))[STATUS_KEY];
  status.textContent = latest
    ? `${latest.message} Last checked ${new Date(latest.checkedAt).toLocaleTimeString()}.`
    : "No website checked yet.";
}

document.querySelector("#check-now").addEventListener("click", async () => {
  status.textContent = "Checking the active tab…";
  await chrome.runtime.sendMessage({ type: "fieldflow-check-now" });
  await render();
});
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") render();
});
render();
