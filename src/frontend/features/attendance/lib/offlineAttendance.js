import { apiJson } from "@/frontend/lib/apiClient";

const QUEUE_KEY = "fieldflow:attendance-offline-queue";
const DEVICE_KEY = "fieldflow:attendance-device-id";

function storageAvailable() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function attendanceDeviceId() {
  if (!storageAvailable()) return "web-unknown";
  let id = window.localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `web-${crypto.randomUUID()}`;
    window.localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function pendingAttendanceEvents() {
  if (!storageAvailable()) return [];
  try {
    const items = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function save(items) {
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("fieldflow:attendance-queue", { detail: { count: items.length } }));
}

export function queueAttendanceEvent(action, location, timeZone) {
  const event = {
    action,
    location,
    timeZone,
    clientEventId: crypto.randomUUID(),
    deviceId: attendanceDeviceId(),
    capturedAt: new Date().toISOString(),
    offline: true
  };
  const items = pendingAttendanceEvents();
  if (items.some(item => item.action === action)) return items.find(item => item.action === action);
  save([...items, event]);
  return event;
}

export async function submitAttendanceEvent(action, location, timeZone) {
  const event = {
    action,
    location,
    timeZone,
    clientEventId: crypto.randomUUID(),
    deviceId: attendanceDeviceId(),
    capturedAt: new Date().toISOString(),
    offline: false
  };
  if (!navigator.onLine) {
    queueAttendanceEvent(action, location, timeZone);
    return { queued: true };
  }
  try {
    return await apiJson("/api/attendance", { method: "POST", body: JSON.stringify(event) });
  } catch (error) {
    if (!navigator.onLine || /fetch|network|offline/i.test(error.message)) {
      queueAttendanceEvent(action, location, timeZone);
      return { queued: true };
    }
    throw error;
  }
}

export async function flushAttendanceQueue() {
  if (!storageAvailable() || !navigator.onLine) return { synced: 0, remaining: pendingAttendanceEvents().length };
  const items = pendingAttendanceEvents();
  let synced = 0;
  for (let index = 0; index < items.length; index += 1) {
    try {
      await apiJson("/api/attendance", { method: "POST", body: JSON.stringify(items[index]) });
      synced += 1;
    } catch (error) {
      const remaining = items.slice(index);
      save(remaining);
      throw Object.assign(error, { synced, remaining: remaining.length });
    }
  }
  save([]);
  return { synced, remaining: 0 };
}
