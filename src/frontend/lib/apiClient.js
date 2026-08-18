"use client";

import { supabase } from "@/frontend/lib/supabase";

let sessionRequest = null;
let refreshRequest = null;

function getSessionOnce() {
  if (sessionRequest) return sessionRequest;
  const request = supabase.auth.getSession();
  sessionRequest = request;
  request.then(() => {
    if (sessionRequest === request) sessionRequest = null;
  }, () => {
    if (sessionRequest === request) sessionRequest = null;
  });
  return request;
}

function refreshSessionOnce() {
  if (refreshRequest) return refreshRequest;
  const request = supabase.auth.refreshSession();
  refreshRequest = request;
  request.then(() => {
    if (refreshRequest === request) refreshRequest = null;
  }, () => {
    if (refreshRequest === request) refreshRequest = null;
  });
  return request;
}

function fetchWithToken(input, init, accessToken) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(input, { ...init, headers });
}

export async function authenticatedFetch(input, init = {}) {
  if (!supabase) throw new Error("FieldFlow is not connected to Supabase. Configure .env.local first.");
  const { data, error } = await getSessionOnce();
  if (error || !data.session?.access_token) throw new Error("Your session expired. Please sign in again.");
  const accessToken = data.session.access_token;
  const response = await fetchWithToken(input, init, accessToken);
  if (response.status !== 401) return response;

  // A backgrounded tab can wake just before Supabase finishes rotating its
  // expired access token. Reuse a token another request has already refreshed,
  // or perform one shared refresh, then retry the original request exactly once.
  const latest = await getSessionOnce();
  let retryAccessToken = latest.data?.session?.access_token;
  if (!retryAccessToken || retryAccessToken === accessToken) {
    const refreshed = await refreshSessionOnce();
    if (refreshed.error || !refreshed.data.session?.access_token) {
      throw new Error("Your browser session could not be refreshed. Please sign in again.");
    }
    retryAccessToken = refreshed.data.session.access_token;
  }
  return fetchWithToken(input, init, retryAccessToken);
}

export async function apiJson(input, init = {}) {
  const response = await authenticatedFetch(input, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}
