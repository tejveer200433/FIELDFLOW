"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiJson } from "@/frontend/lib/apiClient";

const TrackingContext = createContext(null);

export function EmployeeTrackingProvider({ children }) {
  const watchId = useRef(null);
  const lastAttemptAt = useRef(0);
  const [status, setStatus] = useState("idle");
  const [latest, setLatest] = useState(null);

  const publish = useCallback(async position => {
    const coords = position.coords || position;
    const location = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy };
    setLatest(location);
    const now = Date.now();
    if (now - lastAttemptAt.current < 10000) return location;
    lastAttemptAt.current = now;
    try {
      await apiJson("/api/locations", { method: "POST", body: JSON.stringify(location) });
      setStatus("sharing");
      return location;
    } catch (error) {
      lastAttemptAt.current = 0;
      setStatus(navigator.onLine ? "error" : "offline");
      throw error;
    }
  }, []);

  const getPosition = useCallback(() => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser does not support location services."));
    navigator.geolocation.getCurrentPosition(position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }), error => reject(new Error(error.code === 1 ? "Location permission was denied. Enable it in browser settings." : "GPS location is unavailable. Check device location settings.")), { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }), []);

  const startTracking = useCallback(async initialLocation => {
    setStatus("requesting");
    const first = initialLocation || await getPosition();
    await publish(first);
    localStorage.setItem("fieldflow-tracking", "true");
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = navigator.geolocation.watchPosition(position => publish(position).catch(() => {}), () => setStatus("error"), { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
    return first;
  }, [getPosition, publish]);

  const stopTracking = useCallback(async () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    localStorage.removeItem("fieldflow-tracking");
    lastAttemptAt.current = 0;
    setStatus("idle");
    await apiJson("/api/locations", { method: "POST", body: JSON.stringify({ sharing: false }) }).catch(() => {});
  }, []);

  useEffect(() => {
    const resume = () => {
      if (localStorage.getItem("fieldflow-tracking") === "true") startTracking().catch(() => setStatus(navigator.onLine ? "error" : "offline"));
    };
    const resumeWhenVisible = () => {
      if (document.visibilityState === "visible") resume();
    };
    resume();
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resumeWhenVisible);
    return () => {
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resumeWhenVisible);
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [startTracking]);

  return <TrackingContext.Provider value={{ status, latest, startTracking, stopTracking, getPosition }}>{children}</TrackingContext.Provider>;
}

export function useEmployeeTracking() { return useContext(TrackingContext); }
