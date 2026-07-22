"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const TrackingContext = createContext(null);

export function EmployeeTrackingProvider({ children }) {
  const watchId = useRef(null);
  const lastSentAt = useRef(0);
  const [status, setStatus] = useState("idle");
  const [latest, setLatest] = useState(null);

  const identity = useCallback(() => ({
    employeeId: localStorage.getItem("fieldflow-employee-id") || "employee-demo",
    name: localStorage.getItem("fieldflow-name") || "Employee"
  }), []);

  const publish = useCallback(async position => {
    const location = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy };
    setLatest(location);
    const now = Date.now();
    if (now - lastSentAt.current < 10000) return location;
    lastSentAt.current = now;
    const response = await fetch("/api/locations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...identity(), ...location }) });
    if (!response.ok) throw new Error("Could not share the location.");
    setStatus("sharing");
    return location;
  }, [identity]);

  const getPosition = useCallback(() => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser does not support location services."));
    navigator.geolocation.getCurrentPosition(position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }), error => reject(new Error(error.code === 1 ? "Location permission was denied. Enable it in browser settings." : "GPS location is unavailable. Check device location settings.")), { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }), []);

  const startTracking = useCallback(async () => {
    setStatus("requesting");
    const first = await getPosition();
    await publish({ coords: first });
    localStorage.setItem("fieldflow-tracking", "true");
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = navigator.geolocation.watchPosition(position => publish(position).catch(() => setStatus("error")), () => setStatus("error"), { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
    return first;
  }, [getPosition, publish]);

  const stopTracking = useCallback(async () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    localStorage.removeItem("fieldflow-tracking");
    setStatus("idle");
    await fetch("/api/locations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: identity().employeeId, sharing: false }) }).catch(() => {});
  }, [identity]);

  useEffect(() => {
    if (localStorage.getItem("fieldflow-tracking") === "true") startTracking().catch(() => setStatus("error"));
    return () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); };
  }, [startTracking]);

  return <TrackingContext.Provider value={{ status, latest, startTracking, stopTracking, getPosition }}>{children}</TrackingContext.Provider>;
}

export function useEmployeeTracking() { return useContext(TrackingContext); }
