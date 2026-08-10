import { CONFIG } from "./config.js";

const domain = new URL(window.location.href).searchParams.get("domain") || "";
if (domain) {
  document.querySelector("#explanation").textContent =
    `Your organization's monitoring policy blocks access to "${domain}" during work hours.`;
  const extensionApi = globalThis.browser ?? globalThis.chrome;
  extensionApi.runtime.sendMessage({ type: "fieldflow-blocked", domain }).catch?.(() => {});
  const checkAccess = async () => {
    const result = await extensionApi.runtime.sendMessage({ type: "fieldflow-check-access", domain }).catch?.(() => null);
    if (result?.allowed) window.location.replace(`https://${domain}`);
  };
  document.querySelector("#check-access").addEventListener("click", checkAccess);
  window.setInterval(checkAccess, 5000);
}
document.querySelector("#request-link").href =
  `${CONFIG.fieldflowAppUrl}/employee/activity?requestDomain=${encodeURIComponent(domain)}`;
