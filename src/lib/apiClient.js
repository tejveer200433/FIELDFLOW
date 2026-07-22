"use client";

import { supabase } from "@/lib/supabase";

export async function authenticatedFetch(input, init = {}) {
  if (!supabase) throw new Error("FieldFlow is not connected to Supabase. Configure .env.local first.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Your session expired. Please sign in again.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(input, { ...init, headers });
}

export async function apiJson(input, init = {}) {
  const response = await authenticatedFetch(input, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}
