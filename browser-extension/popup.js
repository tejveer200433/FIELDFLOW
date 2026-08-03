import { CONFIG } from "./config.js";

const extensionApi = globalThis.browser ?? globalThis.chrome;
const STATUS_KEY = "fieldflowWebsiteStatus";
const status = document.querySelector("#status");
const connection = document.querySelector("#connection");

async function render() {
  try {
    const response = await fetch(`${CONFIG.bridgeUrl}/v1/status`);
    const result = await response.json();
    connection.textContent = result.tracking
      ? "Desktop agent connected - tracking active"
      : "Desktop agent connected - tracking not active";
  } catch {
    connection.textContent = "Desktop agent not connected";
  }
  const latest = (await extensionApi.storage.local.get(STATUS_KEY))[STATUS_KEY];
  status.textContent = latest
    ? `${latest.message} Last automatic check ${new Date(latest.checkedAt).toLocaleTimeString()}.`
    : "Waiting for the first automatic website sample.";
}

extensionApi.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") render();
});
render();
