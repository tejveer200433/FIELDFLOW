"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Pencil, Plus } from "lucide-react";
import { apiJson } from "@/lib/apiClient";

const emptyForm = {
  name: "",
  latitude: "",
  longitude: "",
  radiusM: "200"
};

export default function AttendanceLocations() {
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const payload = await apiJson("/api/attendance-locations", { cache: "no-store" });
      setLocations(payload.data);
    } catch (error) {
      setMessage(error.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function edit(location) {
    setEditingId(location.id);
    setForm({
      name: location.name,
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      radiusM: String(location.radiusM)
    });
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId("");
    setForm(emptyForm);
    setMessage("");
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const body = {
        ...(editingId ? { id: editingId } : {}),
        name: form.name,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        radiusM: Number(form.radiusM)
      };
      await apiJson("/api/attendance-locations", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(body)
      });
      setMessage(editingId ? "Attendance location updated." : "Attendance location added.");
      setEditingId("");
      setForm(emptyForm);
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(location) {
    setBusy(true);
    setMessage("");
    try {
      await apiJson("/api/attendance-locations", {
        method: "PATCH",
        body: JSON.stringify({ id: location.id, active: !location.active })
      });
      setMessage(`${location.name} ${location.active ? "disabled" : "enabled"}.`);
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="mb-7">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Attendance locations</h1>
      <p className="mt-2 text-slate-500">Configure the office and site boundaries employees may use for attendance.</p>
    </div>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <form onSubmit={save} className="card h-fit p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-blue-50 text-blue-600">
            <MapPin className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-bold">{editingId ? "Edit location" : "Add office or site"}</h2>
            <p className="text-sm text-slate-500">The recommended radius is 200 metres.</p>
          </div>
        </div>

        <label className="label mt-6" htmlFor="attendance-location-name">Location name</label>
        <input id="attendance-location-name" required minLength={2} maxLength={160} className="input" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Main office" />

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="attendance-location-latitude">Latitude</label>
            <input id="attendance-location-latitude" required type="number" step="any" min="-90" max="90" className="input" value={form.latitude} onChange={event => setForm(current => ({ ...current, latitude: event.target.value }))} placeholder="19.0760" />
          </div>
          <div>
            <label className="label" htmlFor="attendance-location-longitude">Longitude</label>
            <input id="attendance-location-longitude" required type="number" step="any" min="-180" max="180" className="input" value={form.longitude} onChange={event => setForm(current => ({ ...current, longitude: event.target.value }))} placeholder="72.8777" />
          </div>
        </div>

        <label className="label mt-4" htmlFor="attendance-location-radius">Allowed radius (metres)</label>
        <input id="attendance-location-radius" required type="number" step="1" min="25" max="5000" className="input" value={form.radiusM} onChange={event => setForm(current => ({ ...current, radiusM: event.target.value }))} />
        <p className="mt-1.5 text-xs text-slate-500">Allowed range: 25 to 5000 metres.</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button disabled={busy} className="btn-primary" type="submit">
            {editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {busy ? "Saving..." : editingId ? "Save changes" : "Add location"}
          </button>
          {editingId && <button disabled={busy} type="button" onClick={cancelEdit} className="btn-secondary">Cancel</button>}
        </div>
        {message && <p aria-live="polite" className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">{message}</p>}
      </form>

      <section className="card overflow-hidden">
        <div className="border-b px-5 py-4 sm:px-6">
          <h2 className="font-bold">Saved locations</h2>
          <p className="text-sm text-slate-500">Only enabled locations can authorize check-in or check-out.</p>
        </div>
        <div className="divide-y">
          {locations.map(location => <article key={location.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold">{location.name}</h3>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${location.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{location.active ? "Enabled" : "Disabled"}</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{location.latitude}, {location.longitude}</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">{location.radiusM.toLocaleString()} metre radius</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => edit(location)} className="btn-secondary"><Pencil className="h-4 w-4" />Edit</button>
              <button disabled={busy} onClick={() => toggle(location)} className={location.active ? "rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50" : "btn-primary"}>
                {location.active ? "Disable" : "Enable"}
              </button>
            </div>
          </article>)}
          {!locations.length && <div className="p-10 text-center text-slate-500">No attendance locations have been added yet.</div>}
        </div>
      </section>
    </div>
  </>;
}
