"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiJson } from "@/frontend/lib/apiClient";

export function formatTimeAgo(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function useNotifications({ limit = 20, enabled = true, initialDelay = 1200, interval = 30000 } = {}) {
  const inFlight = useRef(null);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const request = (async () => {
      setRefreshing(true);
      try {
        const payload = await apiJson(`/api/notifications?limit=${limit}`, { cache: "no-store" });
        setItems(payload.data || []);
        setUnreadCount(payload.unreadCount || 0);
        setError("");
        return true;
      } catch {
        setError("Notifications could not refresh. Existing items are unchanged.");
        return false;
      } finally {
        setRefreshing(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = request;
    return request;
  }, [limit]);

  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    let timer = null;
    let failures = 0;

    const schedule = delay => {
      window.clearTimeout(timer);
      timer = window.setTimeout(tick, delay);
    };
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState !== "visible" || !navigator.onLine) {
        schedule(interval);
        return;
      }
      const succeeded = await load();
      failures = succeeded ? 0 : Math.min(failures + 1, 4);
      schedule(succeeded ? interval : Math.min(5 * 60 * 1000, interval * (2 ** failures)));
    };
    const refreshWhenAvailable = () => {
      if (document.visibilityState === "visible" && navigator.onLine) schedule(0);
    };

    schedule(initialDelay);
    window.addEventListener("online", refreshWhenAvailable);
    document.addEventListener("visibilitychange", refreshWhenAvailable);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener("online", refreshWhenAvailable);
      document.removeEventListener("visibilitychange", refreshWhenAvailable);
    };
  }, [enabled, initialDelay, interval, load]);

  const markAllRead = useCallback(async () => {
    try {
      await apiJson("/api/notifications", { method: "PATCH", body: JSON.stringify({ all: true }) });
      setUnreadCount(0);
      setItems(current => current.map(item => ({ ...item, read: true })));
      setError("");
    } catch {
      setError("Notifications could not be marked as read. Please try again.");
    }
  }, []);

  return { items, unreadCount, markAllRead, error, refreshing, refresh: load };
}
