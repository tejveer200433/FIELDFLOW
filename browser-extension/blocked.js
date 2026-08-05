import { CONFIG } from "./config.js";

const domain = new URL(window.location.href).searchParams.get("domain") || "";
if (domain) {
  document.querySelector("#explanation").textContent =
    `Your organization's monitoring policy blocks access to "${domain}" during work hours.`;
}
document.querySelector("#request-link").href =
  `${CONFIG.fieldflowAppUrl}/employee/activity?requestDomain=${encodeURIComponent(domain)}`;
