"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Radio, TimerReset } from "lucide-react";
import { useEmployeeTracking } from "@/components/EmployeeTrackingContext";
import { durationSeconds, formatDuration } from "@/lib/time";
import { apiJson } from "@/lib/apiClient";

function Status({ value }) { return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${value === "Late" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{value}</span>; }

export default function EmployeeAttendance() {
  const tracking = useEmployeeTracking();
  const [identity, setIdentity] = useState({ employeeId: "employee-demo", employee: "Employee" });
  const [records, setRecords] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => { const payload = await apiJson("/api/attendance", { cache: "no-store" }); setRecords(payload.data); }, []);

  useEffect(() => {
    const current = { employeeId: localStorage.getItem("fieldflow-employee-id") || "employee-demo", employee: localStorage.getItem("fieldflow-name") || "Employee" };
    setIdentity(current); load(current.employeeId);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(() => load(current.employeeId), 10000);
    return () => { clearInterval(clock); clearInterval(refresh); };
  }, [load]);

  const open = records.find(item => !item.checkOutAt && !item.checkOut);
  const openSeconds = open ? durationSeconds(open, now) : 0;
  const days = useMemo(() => { const grouped = new Map(); records.forEach(record => { if (!grouped.has(record.date)) grouped.set(record.date, []); grouped.get(record.date).push(record); }); return Array.from(grouped.entries()).map(([date, shifts]) => ({ date, shifts, totalSeconds: shifts.reduce((sum, shift) => sum + durationSeconds(shift, now), 0) })).sort((a, b) => b.date.localeCompare(a.date)); }, [records, now]);
  const completedSeconds = records.filter(item => item.checkOutAt || item.checkOut).reduce((sum, item) => sum + durationSeconds(item), 0);

  async function act(action) {
    setBusy(true); setMessage("");
    try {
      const location = action === "check-in" ? await tracking.startTracking() : await tracking.getPosition();
      const payload = await apiJson("/api/attendance", { method: "POST", body: JSON.stringify({ action, location, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
      if (action === "check-out") await tracking.stopTracking();
      setMessage(action === "check-in" ? "Checked in. Your work timer and live location are running." : `Checked out. Total shift time: ${payload.data.hours}.`);
      await load(identity.employeeId);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  return <><div className="mb-7"><h1 className="text-3xl font-extrabold sm:text-4xl">Attendance</h1><p className="mt-2 text-slate-500">Exact GPS-verified work time for every day.</p></div><section className="card p-6"><div className="flex flex-wrap items-center justify-between gap-5"><div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-full bg-blue-50 text-blue-600"><Clock3 /></span><div><p className="text-xs uppercase tracking-widest text-slate-500">Current time</p><strong className="text-3xl">{new Date(now).toLocaleTimeString()}</strong></div></div>{open && <div className="rounded-2xl bg-blue-50 px-6 py-3 text-right"><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Current shift</p><strong className="font-mono text-2xl text-blue-700">{formatDuration(openSeconds)}</strong></div>}</div>{open && <div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Check-in</p><strong>{open.checkIn}</strong></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Started</p><strong>{open.checkInAt ? new Date(open.checkInAt).toLocaleString() : `${open.date} ${open.checkIn}`}</strong></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">GPS accuracy</p><strong>{open.checkInLocation?.accuracy ? `${Math.round(open.checkInLocation.accuracy)} metres` : "Recorded"}</strong></div></div>}<button disabled={busy} onClick={() => act(open ? "check-out" : "check-in")} className={`mt-5 w-full rounded-2xl px-5 py-4 font-bold text-white disabled:opacity-50 ${open ? "bg-rose-500" : "bg-blue-600"}`}>{busy ? "Getting GPS location…" : open ? `Check out · ${formatDuration(openSeconds)}` : "Check in with GPS"}</button><p className="mt-3 text-center text-sm text-slate-500">The final total is calculated from exact check-in and check-out timestamps.</p>{message && <p className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">{message}</p>}</section><section className="card mt-6 p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-slate-500">Live location</p><strong>{tracking.status === "sharing" ? "Sharing with manager and admin" : tracking.status === "requesting" ? "Requesting GPS…" : "Not sharing"}</strong></div><span className={`grid h-12 w-12 place-items-center rounded-full ${tracking.status === "sharing" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}><Radio /></span></div></section><div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="card p-5"><p className="text-xs uppercase tracking-widest text-slate-500">Completed work time</p><strong className="mt-2 block text-2xl text-blue-700">{formatDuration(completedSeconds)}</strong></div><div className="card p-5"><p className="text-xs uppercase tracking-widest text-slate-500">Days recorded</p><strong className="mt-2 block text-2xl text-emerald-700">{days.length}</strong></div></div><h2 className="mt-8 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-500"><TimerReset className="h-4 w-4" />Daily time history</h2><div className="mt-3 space-y-4">{days.map(day => <article key={day.date} className="card overflow-hidden"><div className="flex items-center justify-between bg-slate-50 px-5 py-4"><div><strong>{day.date}</strong><p className="text-xs text-slate-500">{day.shifts.length} {day.shifts.length === 1 ? "shift" : "shifts"}</p></div><strong className="text-xl text-blue-700">{formatDuration(day.totalSeconds)}</strong></div><div className="divide-y">{day.shifts.map(shift => <div key={shift.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_1fr_1fr_auto]"><div><p className="text-xs text-slate-500">Check-in</p><strong>{shift.checkIn}</strong></div><div><p className="text-xs text-slate-500">Check-out</p><strong>{shift.checkOut || "Working now"}</strong></div><div><p className="text-xs text-slate-500">Shift total</p><strong>{formatDuration(durationSeconds(shift, now))}</strong></div><Status value={shift.status} /></div>)}</div></article>)}</div></>;
}
