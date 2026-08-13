"use client";

import { supabase } from "@/frontend/lib/supabase";

let sessionRequest = null;

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

export async function authenticatedFetch(input, init = {}) {
  if (!supabase) throw new Error("FieldFlow is not connected to Supabase. Configure .env.local first.");
  const { data, error } = await getSessionOnce();
  if (error || !data.session?.access_token) throw new Error("Your session expired. Please sign in again.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(input, { ...init, headers });
}

export async function apiJson(input, init = {}) {
  const response = await authenticatedFetch(input, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}
