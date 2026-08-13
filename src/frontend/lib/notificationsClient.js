"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(() => {
    apiJson(`/api/notifications?limit=${limit}`, { cache: "no-store" })
      .then(payload => {
        setItems(payload.data || []);
        setUnreadCount(payload.unreadCount || 0);
      })
      .catch(() => {});
  }, [limit]);

  useEffect(() => {
    if (!enabled) return undefined;
    let intervalTimer;
    const initialTimer = window.setTimeout(() => {
      load();
      intervalTimer = window.setInterval(() => {
        if (document.visibilityState === "visible") load();
      }, interval);
    }, initialDelay);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalTimer);
    };
  }, [enabled, initialDelay, interval, load]);

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
    setItems(current => current.map(item => ({ ...item, read: true })));
    apiJson("/api/notifications", { method: "PATCH", body: JSON.stringify({ all: true }) })
      .then(load)
      .catch(load);
  }, [load]);

  return { items, unreadCount, markAllRead };
}
