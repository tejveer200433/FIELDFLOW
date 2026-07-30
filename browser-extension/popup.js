/* global chrome */
import { CONFIG } from "./config.js";
const SESSION_KEY = "fieldflowSession";
const signedOut = document.querySelector("#signed-out");
const signedIn = document.querySelector("#signed-in");
const message = document.querySelector("#message");

async function render() {
  const value = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY];
  signedOut.hidden = Boolean(value);
  signedIn.hidden = !value;
}
document.querySelector("#sign-in").addEventListener("click", async () => {
  message.textContent = "";
  const response = await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: CONFIG.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: document.querySelector("#email").value.trim(),
      password: document.querySelector("#password").value
    })
  });
  document.querySelector("#password").value = "";
  if (!response.ok) {
    message.textContent = "Sign in failed.";
    return;
  }
  const data = await response.json();
  await chrome.storage.session.set({ [SESSION_KEY]: {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000
  } });
  await render();
});
document.querySelector("#sign-out").addEventListener("click", async () => {
  await chrome.storage.session.remove(SESSION_KEY);
  await render();
});
render();
