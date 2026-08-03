"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, Clock3, Coffee, MapPin, Radio, TimerReset } from "lucide-react";
import { useEmployeeTracking } from "@/components/EmployeeTrackingContext";
import { durationSeconds, formatDuration } from "@/lib/time";
import { apiJson } from "@/lib/apiClient";
import EmployeeAttendanceRequests from "@/components/EmployeeAttendanceRequests";

function Status({ value }) {
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${value === "Late" ? "border-red-600 bg-red-600 text-white" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{value}</span>;
}

function localDate(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function scheduledTime(record) {
  if (!record?.scheduledStartAt || !record?.scheduledEndAt) return null;
  const options = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: record.timeZone
  };
  return `${new Date(record.scheduledStartAt).toLocaleTimeString([], options)}–${new Date(record.scheduledEndAt).toLocaleTimeString([], options)}`;
}

function AttendanceToday() {
  const tracking = useEmployeeTracking();
  const [identity, setIdentity] = useState({ employeeId: "employee-demo", employee: "Employee" });
  const [records, setRecords] = useState([]);
  const [locations, setLocations] = useState([]);
  const [management, setManagement] = useState({ breaks: [], schedules: [], rosters: [], holidays: [], templates: [] });
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [attendance, attendanceLocations, attendanceManagement] = await Promise.all([
      apiJson("/api/attendance", { cache: "no-store" }),
      apiJson("/api/attendance-locations", { cache: "no-store" }),
      apiJson("/api/attendance-management", { cache: "no-store" })
    ]);
    setRecords(attendance.data);
    setLocations(attendanceLocations.data);
    setManagement(attendanceManagement.data);
  }, []);

  useEffect(() => {
    const current = {
      employeeId: localStorage.getItem("fieldflow-employee-id") || "employee-demo",
      employee: localStorage.getItem("fieldflow-name") || "Employee"
    };
    setIdentity(current);
    load().catch(error => setMessage(error.message));
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(() => load().catch(() => {}), 10000);
    return () => {
      clearInterval(clock);
      clearInterval(refresh);
    };
  }, [load]);

  const open = records.find(item => !item.checkOutAt && !item.checkOut);
  const activeBreak = management.breaks.find(item => !item.endedAt);
  const today = localDate(new Date(now));
  const roster = management.rosters.find(item => item.workDate === today);
  const regularSchedule = management.schedules.find(item =>
    item.effectiveFrom <= today
    && (!item.effectiveTo || item.effectiveTo >= today)
  );
  const schedule = roster || regularSchedule;
  const scheduleTemplate = management.templates.find(item => item.id === schedule?.shiftTemplateId);
  const weeklyOff = !roster && regularSchedule && (
    !regularSchedule.weekdays.includes(new Date(now).getDay())
    || scheduleTemplate?.weeklyOffDays.includes(new Date(now).getDay())
  );
  const openSeconds = open ? durationSeconds(open, now) : 0;
  const days = useMemo(() => {
    const grouped = new Map();
    records.forEach(record => {
      if (!grouped.has(record.date)) grouped.set(record.date, []);
      grouped.get(record.date).push(record);
    });
    return Array.from(grouped.entries())
      .map(([date, shifts]) => ({
        date,
        shifts,
        totalSeconds: shifts.reduce((sum, shift) => sum + durationSeconds(shift, now), 0)
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [records, now]);
  const completedSeconds = records
    .filter(item => item.checkOutAt || item.checkOut)
    .reduce((sum, item) => sum + durationSeconds(item), 0);

  async function act(action) {
    setBusy(true);
    setMessage("");
    try {
      const location = action === "check-in"
        ? await tracking.startTracking()
        : await tracking.getPosition();
      const payload = await apiJson("/api/attendance", {
        method: "POST",
        body: JSON.stringify({
          action,
          location,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      });
      if (action === "check-out") await tracking.stopTracking();
      setMessage(action === "check-in"
        ? payload.data.shiftName
          ? `Checked in for ${payload.data.shiftName} (${scheduledTime(payload.data)}). Status: ${payload.data.status}.`
          : `Checked in at ${payload.data.checkInLocation.geofenceName || "an attendance location"}, but no work schedule was assigned for today.`
        : `Checked out. Total shift time: ${payload.data.hours}.`);
      await load();
    } catch (error) {
      if (action === "check-in") await tracking.stopTracking().catch(() => {});
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function breakAction() {
    setBusy(true);
    setMessage("");
    try {
      const payload = await apiJson("/api/attendance-management", {
        method: "POST",
        body: JSON.stringify({ action: activeBreak ? "break-end" : "break-start" })
      });
      setMessage(payload.message);
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <section className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
        <div>
          <h2 className="font-bold text-blue-950">Location-restricted attendance</h2>
          <p className="mt-1 text-sm text-blue-800">Check-in and check-out are allowed only within the configured office/site radius.</p>
          {locations.length > 0
            ? <div className="mt-3 flex flex-wrap gap-2">{locations.map(location => <span key={location.id} className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-800">{location.name} · {location.radiusM.toLocaleString()} m</span>)}</div>
            : <p className="mt-3 text-sm font-semibold text-amber-700">Attendance is not configured yet. Ask an administrator to add an office or site location.</p>}
        </div>
      </div>
    </section>

    <section className="card mb-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-violet-50 text-violet-600"><CalendarRange className="h-5 w-5" /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Today&apos;s plan</p>
            <strong>{schedule?.shiftName || "No assigned shift"}</strong>
            <p className="text-xs text-slate-500">{scheduleTemplate ? `${scheduleTemplate.startTime}–${scheduleTemplate.endTime} · ${scheduleTemplate.graceMinutes} min grace` : roster ? "Daily roster override" : schedule ? "Regular work schedule" : "Default attendance policy"}</p>
          </div>
        </div>
        {(weeklyOff || management.holidays.some(item => item.date === today)) && <span className="rounded-full bg-violet-50 px-3 py-2 text-sm font-bold text-violet-700">{weeklyOff ? "Weekly off" : "Holiday"}</span>}
      </div>
    </section>

    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-blue-50 text-blue-600"><Clock3 /></span>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">Current time</p>
            <strong className="text-3xl">{new Date(now).toLocaleTimeString()}</strong>
          </div>
        </div>
        {open && <div className="rounded-2xl bg-blue-50 px-6 py-3 text-right">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Current shift</p>
          <strong className="font-mono text-2xl text-blue-700">{formatDuration(openSeconds)}</strong>
        </div>}
      </div>

      {open && <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Check-in</p><strong>{open.checkIn}</strong></div>
        <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Started</p><strong>{open.checkInAt ? new Date(open.checkInAt).toLocaleString() : `${open.date} ${open.checkIn}`}</strong></div>
        <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Applied shift</p><strong>{open.shiftName || "No schedule"}</strong></div>
        <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Scheduled</p><strong>{scheduledTime(open) || "Not assigned"}</strong></div>
        <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Arrival status</p><Status value={open.status} /></div>
        <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">GPS accuracy</p><strong>{open.checkInLocation?.accuracy ? `${Math.round(open.checkInLocation.accuracy)} metres` : "Recorded"}</strong></div>
      </div>}
      {open && <div className="mt-3 rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Verified geofence</p><strong>{open.checkInLocation?.geofenceName || "Recorded"}</strong>{open.checkInLocation?.distanceM != null && <span className="ml-2 text-xs text-slate-500">{Math.round(open.checkInLocation.distanceM)} m from location</span>}</div>}

      <button disabled={busy} onClick={() => act(open ? "check-out" : "check-in")} className={`mt-5 w-full rounded-2xl px-5 py-4 font-bold text-white disabled:opacity-50 ${open ? "bg-rose-500" : "bg-blue-600"}`}>
        {busy ? "Getting GPS location…" : open ? `Check out · ${formatDuration(openSeconds)}` : "Check in with GPS"}
      </button>
      {open && <button disabled={busy} onClick={breakAction} className={`mt-3 w-full rounded-2xl border px-5 py-3.5 font-bold disabled:opacity-50 ${activeBreak ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-700"}`}><Coffee className="mr-2 inline h-5 w-5" />{activeBreak ? `End break · started ${new Date(activeBreak.startedAt).toLocaleTimeString()}` : "Start break"}</button>}
      {open?.missedCheckout && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-700">Your scheduled shift has ended and checkout is overdue. Please end any active break and check out now.</p>}
      <p className="mt-3 text-center text-sm text-slate-500">Your location is verified securely before the attendance record is changed.</p>
      {message && <p aria-live="polite" className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">{message}</p>}
    </section>

    <section className="card mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Live location</p>
          <strong>{tracking.status === "sharing" ? "Sharing with manager and admin" : tracking.status === "requesting" ? "Requesting GPS…" : "Not sharing"}</strong>
        </div>
        <span className={`grid h-12 w-12 place-items-center rounded-full ${tracking.status === "sharing" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}><Radio /></span>
      </div>
    </section>

    <div className="mt-8 grid gap-4 sm:grid-cols-2">
      <div className="card p-5"><p className="text-xs uppercase tracking-widest text-slate-500">Completed work time</p><strong className="mt-2 block text-2xl text-blue-700">{formatDuration(completedSeconds)}</strong></div>
      <div className="card p-5"><p className="text-xs uppercase tracking-widest text-slate-500">Days recorded</p><strong className="mt-2 block text-2xl text-emerald-700">{days.length}</strong></div>
    </div>

    <h2 className="mt-8 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-500"><TimerReset className="h-4 w-4" />Daily time history</h2>
    <div className="mt-3 space-y-4">
      {days.map(day => <article key={day.date} className="card overflow-hidden">
        <div className="flex items-center justify-between bg-slate-50 px-5 py-4">
          <div><strong>{day.date}</strong><p className="text-xs text-slate-500">{day.shifts.length} {day.shifts.length === 1 ? "shift" : "shifts"}</p></div>
          <strong className="text-xl text-blue-700">{formatDuration(day.totalSeconds)}</strong>
        </div>
        <div className="divide-y">
          {day.shifts.map(shift => <div key={shift.id} className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr_1fr_auto]">
            <div><p className="text-xs text-slate-500">Check-in</p><strong>{shift.checkIn}</strong></div>
            <div><p className="text-xs text-slate-500">Check-out</p><strong>{shift.checkOut || "Working now"}</strong></div>
            <div><p className="text-xs text-slate-500">Applied schedule</p><strong>{shift.shiftName || "No assigned shift"}</strong><p className="text-xs text-slate-500">{scheduledTime(shift) || "No scheduled time stored"}</p></div>
            <div><p className="text-xs text-slate-500">Shift total</p><strong>{formatDuration(durationSeconds(shift, now))}</strong>{(shift.breakMinutes > 0 || shift.overtimeMinutes > 0) && <p className="text-xs text-slate-500">{shift.breakMinutes} min break · {shift.overtimeMinutes} min overtime</p>}</div>
            <Status value={shift.status} />
          </div>)}
        </div>
      </article>)}
    </div>
  </>;
}

export default function EmployeeAttendance() {
  const [tab, setTab] = useState("today");
  return <>
    <div className="mb-7">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Attendance</h1>
      <p className="mt-2 text-slate-500">Work time, breaks, leave, and corrections in one place.</p>
    </div>
    <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
      <button onClick={() => setTab("today")} className={tab === "today" ? "btn-primary shrink-0 rounded-full" : "btn-secondary shrink-0 rounded-full"}><Clock3 className="h-4 w-4" />Today & history</button>
      <button onClick={() => setTab("requests")} className={tab === "requests" ? "btn-primary shrink-0 rounded-full" : "btn-secondary shrink-0 rounded-full"}><CalendarRange className="h-4 w-4" />Leave & corrections</button>
    </div>
    {tab === "today" ? <AttendanceToday /> : <EmployeeAttendanceRequests />}
  </>;
}
