import { CONFIG } from "./config.js";

const domain = new URL(window.location.href).searchParams.get("domain") || "";
if (domain) {
  document.querySelector("#explanation").textContent =
    `Your organization's monitoring policy blocks access to "${domain}" during work hours.`;
  const extensionApi = globalThis.browser ?? globalThis.chrome;
  extensionApi.runtime.sendMessage({ type: "fieldflow-blocked", domain }).catch?.(() => {});
}
document.querySelector("#request-link").href =
  `${CONFIG.fieldflowAppUrl}/employee/activity?requestDomain=${encodeURIComponent(domain)}`;
