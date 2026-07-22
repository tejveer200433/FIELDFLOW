"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, MapPinOff, Radio } from "lucide-react";

const employee = { employeeId: "e-1", name: "Aarav Sharma" };

export default function LocationSharing() {
  const watchId = useRef(null);
  const lastSentAt = useRef(0);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("Your location is not being shared.");
  const [latest, setLatest] = useState(null);

  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
  }, []);

  async function publish(position) {
    const now = Date.now();
    setLatest(position.coords);
    if (now - lastSentAt.current < 10000) return;
    lastSentAt.current = now;
    try {
      const response = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...employee,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        })
      });
      if (!response.ok) throw new Error("Location update failed");
      setStatus("sharing");
      setMessage("Live location is being shared while this page remains open.");
    } catch {
      setStatus("error");
      setMessage("We found your location but could not send it. Check your connection.");
    }
  }

  function start() {
    if (!navigator.geolocation) {
      setStatus("error");
      setMessage("Location services are not supported by this browser.");
      return;
    }
    setStatus("requesting");
    setMessage("Waiting for your location permission…");
    watchId.current = navigator.geolocation.watchPosition(
      publish,
      error => {
        setStatus("error");
        setMessage(error.code === 1 ? "Location permission was denied. You can enable it in browser settings." : "Your location is currently unavailable. Try again outdoors or check GPS settings.");
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
  }

  async function stop() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setStatus("idle");
    setMessage("Location sharing stopped.");
    await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: employee.employeeId, sharing: false })
    }).catch(() => {});
  }

  const active = status === "sharing" || status === "requesting";
  return <section className="card overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-4 p-6">
      <div className="flex gap-4">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
          {active ? <Radio className="h-6 w-6" /> : <MapPinOff className="h-6 w-6" />}
        </span>
        <div><h2 className="font-bold">Live location sharing</h2><p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">{message}</p></div>
      </div>
      {active ? <button className="btn-secondary" onClick={stop}>Stop sharing</button> : <button className="btn-primary" onClick={start}><LocateFixed className="h-4 w-4" />Start sharing</button>}
    </div>
    <div className="border-t bg-slate-50 px-6 py-4 text-xs text-slate-500">
      {latest ? `Last GPS reading: ${latest.latitude.toFixed(5)}, ${latest.longitude.toFixed(5)} · accuracy ${Math.round(latest.accuracy)} m` : "FieldFlow asks before tracking and does not start location sharing automatically."}
    </div>
  </section>;
}
