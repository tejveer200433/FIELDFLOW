"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import { Clock3, LocateFixed, RefreshCw, Satellite } from "lucide-react";
import { apiJson } from "@/lib/apiClient";

function age(timestamp) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

export default function TeamMapCanvas() {
  const [locations, setLocations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const payload = await apiJson("/api/locations", { cache: "no-store" });
      const active = payload.data.filter(item => item.sharing);
      setLocations(active);
      setSelected(current => current ? active.find(item => item.employeeId === current.employeeId) || null : null);
      setError("");
    } catch { setError("Could not refresh employee locations."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [refresh]);

  const center = useMemo(() => locations.length ? [locations[0].latitude, locations[0].longitude] : [28.6139, 77.209], [locations]);

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,2.4fr)_minmax(300px,1fr)]">
    <div className="card relative min-h-[620px] overflow-hidden">
      <MapContainer center={center} zoom={11} scrollWheelZoom className="h-[620px] w-full">
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {locations.map(location => <CircleMarker eventHandlers={{ click: () => setSelected(location) }} key={location.employeeId} center={[location.latitude, location.longitude]} radius={12} pathOptions={{ color: "#fff", weight: 4, fillColor: selected?.employeeId === location.employeeId ? "#0f172a" : "#2563eb", fillOpacity: 1 }}><Popup><strong>{location.name}</strong><br />Updated {age(location.updatedAt)}</Popup></CircleMarker>)}
      </MapContainer>
      {!locations.length && !loading && <div className="pointer-events-none absolute inset-0 z-[500] grid place-items-center"><div className="rounded-3xl bg-white px-8 py-5 text-center shadow-xl"><p className="font-bold">No employees sharing yet</p><p className="mt-1 text-sm text-slate-500">Ask your team to enable location sharing.</p></div></div>}
      <button onClick={refresh} className="absolute right-4 top-4 z-[600] btn-secondary bg-white"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button>
      {error && <p className="absolute bottom-4 left-4 z-[600] rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700 shadow">{error}</p>}
    </div>
    <aside className="card min-h-[620px] p-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Selected technician</p>{selected ? <div className="mt-5"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full bg-blue-100 text-blue-700"><LocateFixed /></span><div><h2 className="text-lg font-bold">{selected.name}</h2><p className="text-sm text-emerald-600">Sharing live</p></div></div><dl className="mt-6 space-y-4 rounded-2xl bg-slate-50 p-5 text-sm"><div><dt className="flex items-center gap-2 text-slate-500"><Clock3 className="h-4 w-4" />Last update</dt><dd className="mt-1 font-bold">{age(selected.updatedAt)}</dd></div><div><dt className="flex items-center gap-2 text-slate-500"><Satellite className="h-4 w-4" />GPS accuracy</dt><dd className="mt-1 font-bold">{selected.accuracy ? `${selected.accuracy} metres` : "Unknown"}</dd></div><div><dt className="text-slate-500">Coordinates</dt><dd className="mt-1 font-mono text-xs">{selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}</dd></div></dl><a target="_blank" rel="noreferrer" className="btn-primary mt-5 w-full" href={`https://www.openstreetmap.org/?mlat=${selected.latitude}&mlon=${selected.longitude}#map=17/${selected.latitude}/${selected.longitude}`}>Open location</a></div> : <p className="mt-4 text-slate-500">Click a marker on the map to see details.</p>}<div className="mt-7 rounded-2xl bg-slate-50 p-4 text-sm"><strong>How this works</strong><p className="mt-1 leading-6 text-slate-500">Employees enable location sharing from their dashboard. Their browser asks for permission, then updates stream while sharing remains active.</p></div></aside>
  </div>;
}
