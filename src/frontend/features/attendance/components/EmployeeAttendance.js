"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bell, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Circle, Clock3, Coffee, Filter, MapPin, Radio, ShieldCheck, TimerReset, TrendingUp, WifiOff } from "lucide-react";
import { useEmployeeTracking } from "@/frontend/features/activity/context/EmployeeTrackingContext";
import { durationSeconds, formatDuration } from "@/shared/time";
import { apiJson } from "@/frontend/lib/apiClient";
import EmployeeAttendanceRequests from "@/frontend/features/attendance/components/EmployeeAttendanceRequests";
import EmployeePageHeader from "@/frontend/features/employee/components/EmployeePageHeader";
import { workedDurationSeconds } from "@/shared/employeeDashboard";
import { flushAttendanceQueue, pendingAttendanceEvents, submitAttendanceEvent } from "@/frontend/features/attendance/lib/offlineAttendance";
import { attendanceCalendarDay, calendarMonthDates } from "@/frontend/features/attendance/lib/attendanceCalendar";

const calendarStyles = {
  Present: "border-emerald-700 bg-emerald-600 text-white shadow-sm",
  Late: "border-orange-600 bg-orange-500 text-white shadow-sm",
  Absent: "border-rose-700 bg-rose-600 text-white shadow-sm",
  Leave: "border-blue-700 bg-blue-600 text-white shadow-sm",
  "Partial leave": "border-sky-700 bg-sky-600 text-white shadow-sm",
  Holiday: "border-violet-700 bg-violet-600 text-white shadow-sm",
  Sunday: "border-slate-600 bg-slate-500 text-white",
  "Weekly off": "border-slate-600 bg-slate-500 text-white",
  Scheduled: "border-cyan-700 bg-cyan-600 text-white",
  "Not scheduled": "border-slate-300 bg-slate-200 text-slate-600"
};

function Status({ value }) {
  const late = value === "Late";
  return <span className={`inline-flex h-7 w-fit shrink-0 self-center justify-self-start items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11px] font-extrabold leading-none shadow-sm ${late ? "border-rose-700 bg-rose-600 text-white" : "border-emerald-700 bg-emerald-600 text-white"}`}><Circle className="h-2.5 w-2.5 fill-current" />{late ? "Late" : "On time"}</span>;
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

function breakMinutes(items, shiftId, type, now) {
  return Math.floor(items.filter(item => item.shiftId === shiftId && item.breakType === type).reduce((total, item) => {
    const end = item.endedAt ? new Date(item.endedAt).getTime() : now;
    return total + Math.max(0, end - new Date(item.startedAt).getTime());
  }, 0) / 60000);
}

function formatClockMinutes(value) {
  if (value == null) return "—";
  const hours = Math.floor(value / 60) % 24;
  const minutes = value % 60;
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function AttendanceToday() {
  const tracking = useEmployeeTracking();
  const loadRequest = useRef(null);
  const [records, setRecords] = useState([]);
  const [locations, setLocations] = useState([]);
  const [management, setManagement] = useState({ breaks: [], schedules: [], rosters: [], holidays: [], leaves: [], templates: [] });
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(() => localDate(new Date()).slice(0, 7));
  const [historyFilter, setHistoryFilter] = useState("All");
  const [calendarOpen, setCalendarOpen] = useState(false);

  const monthDate = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    return new Date(year, month - 1, 1, 12);
  }, [selectedMonth]);
  const monthRange = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    return {
      from: `${year}-${String(month + 1).padStart(2, "0")}-01`,
      to: `${year}-${String(month + 1).padStart(2, "0")}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, "0")}`
    };
  }, [monthDate]);

  const load = useCallback(async () => {
    const requestKey = `${monthRange.from}:${monthRange.to}`;
    if (loadRequest.current?.key === requestKey) return loadRequest.current.promise;
    const request = Promise.all([
      apiJson("/api/attendance", { cache: "no-store" }),
      apiJson("/api/attendance-locations", { cache: "no-store" }),
      apiJson(`/api/attendance-management?from=${monthRange.from}&to=${monthRange.to}`, { cache: "no-store" })
    ]).then(([attendance, attendanceLocations, attendanceManagement]) => {
      setRecords(attendance.data);
      setLocations(attendanceLocations.data);
      setManagement(attendanceManagement.data);
      setPendingCount(pendingAttendanceEvents().length);
    }).finally(() => { if (loadRequest.current?.promise === request) loadRequest.current = null; });
    loadRequest.current = { key: requestKey, promise: request };
    return request;
  }, [monthRange.from, monthRange.to]);

  useEffect(() => {
    load().catch(error => setMessage(error.message));
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const refreshWhenVisible = async () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        try {
          const result = await flushAttendanceQueue();
          if (result.synced) setMessage(`${result.synced} offline attendance event${result.synced === 1 ? "" : "s"} synchronized.`);
          await load();
        } catch (error) {
          setPendingCount(pendingAttendanceEvents().length);
          setMessage(error.message || "Attendance could not refresh. Existing records are unchanged.");
        }
      }
    };
    const refresh = setInterval(refreshWhenVisible, 30000);
    window.addEventListener("online", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      clearInterval(clock);
      clearInterval(refresh);
      window.removeEventListener("online", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
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
  const openSeconds = open ? workedDurationSeconds(open, management.breaks, now) : 0;
  const openGrossSeconds = open ? durationSeconds(open, now) : 0;
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
        totalSeconds: shifts.reduce((sum, shift) => sum + workedDurationSeconds(shift, management.breaks, now), 0)
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [records, management.breaks, now]);
  const monthDays = useMemo(() => days.filter(item => item.date.startsWith(selectedMonth)), [days, selectedMonth]);

  const calendarDays = useMemo(() => {
    const todayKey = localDate(new Date(now));
    return calendarMonthDates(monthDate).map(item => {
      const shifts = records.filter(record => record.date === item.date);
      return {
        key: item.date,
        day: item.day,
        shifts,
        workedSeconds: shifts.reduce((sum, shift) => sum + workedDurationSeconds(shift, management.breaks, now), 0),
        checkIn: shifts[shifts.length - 1]?.checkIn || null,
        ...attendanceCalendarDay({
        date: item.date,
        today: todayKey,
        shifts,
        leaves: management.leaves,
        holidays: management.holidays,
        schedules: management.schedules,
        rosters: management.rosters,
        templates: management.templates
      })
      };
    });
  }, [management.breaks, management.holidays, management.leaves, management.rosters, management.schedules, management.templates, monthDate, now, records]);

  const monthStats = useMemo(() => {
    const count = status => calendarDays.filter(item => status.includes(item.status)).length;
    const present = count(["Present", "Present + leave"]);
    const late = count(["Late"]);
    const absent = count(["Absent"]);
    const leave = calendarDays.reduce((total, item) => total + (item.status === "Leave" ? 1 : ["Partial leave", "Present + leave"].includes(item.status) ? 0.5 : 0), 0);
    const worked = monthDays.reduce((total, item) => total + item.totalSeconds, 0);
    const eligibleDays = present + late + absent;
    const attendanceRate = eligibleDays ? Math.round(((present + late) / eligibleDays) * 100) : null;
    const shiftRecords = monthDays.flatMap(item => item.shifts);
    const averageWorkday = shiftRecords.length ? Math.round(worked / shiftRecords.length) : 0;
    const checkInMinutes = shiftRecords.map(item => {
      const value = new Date(item.checkInAt);
      return Number.isNaN(value.getTime()) ? null : value.getHours() * 60 + value.getMinutes();
    }).filter(value => value != null);
    const averageCheckInMinutes = checkInMinutes.length ? Math.round(checkInMinutes.reduce((sum, value) => sum + value, 0) / checkInMinutes.length) : null;
    const lateMinutes = shiftRecords.map(item => item.scheduledStartAt ? Math.max(0, Math.round((new Date(item.checkInAt) - new Date(item.scheduledStartAt)) / 60000)) : 0);
    const averageLateMinutes = lateMinutes.length ? Math.round(lateMinutes.reduce((sum, value) => sum + value, 0) / lateMinutes.length) : 0;
    return { present, late, absent, leave, worked, attendanceRate, averageWorkday, averageCheckInMinutes, averageLateMinutes };
  }, [calendarDays, monthDays]);

  const filteredHistory = useMemo(() => monthDays.filter(day => {
    if (historyFilter === "All") return true;
    return day.shifts.some(shift => historyFilter === "Present" ? shift.status !== "Late" : shift.status === historyFilter);
  }), [historyFilter, monthDays]);

  function moveMonth(offset) {
    const next = new Date(monthDate.getFullYear(), monthDate.getMonth() + offset, 1, 12);
    setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  }

  const reminders = (() => {
    const result = [...(management.reminders || []).map(item => item.message)];
    if (!open && scheduleTemplate && !weeklyOff && !management.holidays.some(item => item.date === today)) {
      const start = new Date(`${today}T${scheduleTemplate.startTime}`);
      const difference = start.getTime() - now;
      const hasTodayRecord = records.some(item => item.date === today);
      if (!hasTodayRecord && difference > 0 && difference <= 30 * 60 * 1000) result.push(`Your ${schedule?.shiftName || "shift"} starts in ${Math.ceil(difference / 60000)} minutes.`);
      if (!hasTodayRecord && difference < -(scheduleTemplate.graceMinutes || 0) * 60000) result.push("You have not checked in for today's scheduled shift.");
    }
    if (activeBreak?.policyExceeded) result.push("Your active break is longer than the configured policy.");
    if (open?.checkoutWarning) result.push("Your scheduled shift has ended. Please check out.");
    return [...new Set(result)];
  })();

  async function act(action) {
    setBusy(true);
    setMessage("");
    try {
      const location = await tracking.getPosition();
      const payload = await submitAttendanceEvent(action, location, Intl.DateTimeFormat().resolvedOptions().timeZone);
      if (payload.queued) {
        setPendingCount(pendingAttendanceEvents().length);
        setMessage(`${action === "check-in" ? "Check-in" : "Check-out"} saved securely on this device and will synchronize when you reconnect.`);
        return;
      }
      let trackingWarning = "";
      if (action === "check-in") {
        try {
          await tracking.startTracking(location);
        } catch {
          trackingWarning = " Live location could not start; keep this page open and reconnect to retry.";
        }
      } else {
        await tracking.stopTracking();
      }
      const resultMessage = action === "check-in"
        ? payload.data.shiftName
          ? `Checked in for ${payload.data.shiftName} (${scheduledTime(payload.data)}). Status: ${payload.data.status}.`
          : `Checked in at ${payload.data.checkInLocation.geofenceName || "an attendance location"}, but no work schedule was assigned for today.`
        : `Checked out. Total shift time: ${payload.data.hours}.`;
      setMessage(`${resultMessage}${trackingWarning}`);
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function breakAction(breakType = "unpaid") {
    setBusy(true);
    setMessage("");
    try {
      const payload = await apiJson("/api/attendance-management", {
        method: "POST",
        body: JSON.stringify({ action: activeBreak ? "break-end" : "break-start", breakType })
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
    {(pendingCount > 0 || reminders.length > 0 || open?.riskScore >= (management.privacy?.photoEvidenceRiskThreshold || 70)) && <section className="mb-5 space-y-2">
      {pendingCount > 0 && <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><WifiOff className="h-5 w-5 shrink-0" /><div><strong>{pendingCount} attendance event{pendingCount === 1 ? "" : "s"} waiting to sync</strong><p className="mt-1">Keep this device connected; synchronization is automatic when the internet returns.</p></div></div>}
      {reminders.map(item => <div key={item} className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><Bell className="h-5 w-5 shrink-0" /><span>{item}</span></div>)}
      {open?.riskScore >= (management.privacy?.photoEvidenceRiskThreshold || 70) && <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><AlertTriangle className="h-5 w-5 shrink-0" /><span>This attendance event requires review. A manager may request supporting evidence; your attendance record remains visible while it is reviewed.</span></div>}
    </section>}

    <section className="mb-5 rounded-2xl border border-violet-100 bg-violet-50/70 p-5">
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
        <div>
          <h2 className="font-extrabold text-slate-950">Location-restricted attendance</h2>
          <p className="mt-1 text-sm text-slate-600">Check-in and check-out are allowed only within the configured office/site radius.</p>
          <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-violet-700"><ShieldCheck className="h-4 w-4" />Location is collected only for attendance verification and active-shift sharing. Detailed coordinates are retained for {management.privacy?.locationRetentionDays || 90} days.</p>
          {locations.length > 0
            ? <div className="mt-3 flex flex-wrap gap-2">{locations.map(location => <span key={location.id} className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-700">{location.name} · {location.radiusM.toLocaleString()} m</span>)}</div>
            : <p className="mt-3 text-sm font-semibold text-amber-700">Attendance is not configured yet. Ask an administrator to add an office or site location.</p>}
        </div>
      </div>
    </section>

    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-violet-600"><Clock3 /></span>
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">Current time</p>
            <strong className="text-3xl">{new Date(now).toLocaleTimeString()}</strong>
          </div>
        </div>
        {open && <div className="rounded-2xl bg-blue-50 px-6 py-3 text-right">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Current shift</p>
          <strong className="font-mono text-2xl text-blue-700">{formatDuration(openSeconds)}</strong>
          <p className="text-[10px] font-semibold text-blue-600">Net work · {formatDuration(openGrossSeconds)} gross</p>
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

      <button disabled={busy} onClick={() => act(open ? "check-out" : "check-in")} className={`mt-5 w-full rounded-xl px-5 py-4 font-bold text-white transition disabled:opacity-50 ${open ? "bg-rose-500 hover:bg-rose-600" : "bg-violet-600 hover:bg-violet-700"}`}>
        {busy ? "Getting GPS location…" : open ? `Check out · ${formatDuration(openSeconds)}` : "Check in with GPS"}
      </button>
      {open && activeBreak && <button disabled={busy} onClick={() => breakAction(activeBreak.breakType)} className="mt-3 w-full rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3.5 font-bold text-amber-700 disabled:opacity-50"><Coffee className="mr-2 inline h-5 w-5" />End {activeBreak.breakType} break · {formatDuration((now - new Date(activeBreak.startedAt).getTime()) / 1000)}</button>}
      {open && !activeBreak && <div className="mt-3 grid gap-2 sm:grid-cols-2"><button disabled={busy} onClick={() => breakAction("paid")} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3.5 font-bold text-emerald-700 disabled:opacity-50"><Coffee className="mr-2 inline h-5 w-5" />Start paid break</button><button disabled={busy} onClick={() => breakAction("unpaid")} className="rounded-2xl border border-slate-200 bg-white px-5 py-3.5 font-bold text-slate-700 disabled:opacity-50"><Coffee className="mr-2 inline h-5 w-5" />Start unpaid break</button></div>}
      {open?.checkoutWarning && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-700">Your scheduled shift has ended. Please check out now{open.autoCheckoutAt ? `; otherwise it will close automatically at ${new Date(open.autoCheckoutAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}.</p>}
      <p className="mt-3 text-center text-sm text-slate-500">Your location is verified securely before the attendance record is changed.</p>
      {message && <p aria-live="polite" className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">{message}</p>}
    </section>

    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Live location</p>
          <strong>{tracking.status === "sharing" ? "Sharing with manager and admin" : tracking.status === "requesting" ? "Requesting GPS…" : tracking.status === "offline" ? "Waiting for connection" : tracking.status === "error" ? "Location sharing needs attention" : "Not sharing"}</strong>
        </div>
        <span className={`grid h-12 w-12 place-items-center rounded-full ${tracking.status === "sharing" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}><Radio /></span>
      </div>
    </section>

    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5"><div><div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-violet-700" /><h2 className="text-lg font-extrabold text-slate-950">Attendance</h2></div><p className="text-xs text-slate-500">Track attendance and working hours</p></div><div className="flex items-center gap-2"><div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5"><button onClick={() => moveMonth(-1)} aria-label="Previous month" className="rounded-md p-1.5 text-slate-600 hover:bg-white hover:text-violet-700"><ChevronLeft className="h-4 w-4" /></button><strong className="min-w-28 px-2 text-center text-xs text-slate-900">{monthDate.toLocaleDateString([], { month: "long", year: "numeric" })}</strong><button onClick={() => moveMonth(1)} aria-label="Next month" className="rounded-md p-1.5 text-slate-600 hover:bg-white hover:text-violet-700"><ChevronRight className="h-4 w-4" /></button></div><button type="button" aria-expanded={calendarOpen} aria-controls="attendance-month-calendar" onClick={() => setCalendarOpen(value => !value)} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-violet-800 focus:outline-none focus:ring-4 focus:ring-violet-200"><CalendarDays className="h-4 w-4" />{calendarOpen ? "Close calendar" : "Open calendar"}</button></div></div>

      <div className="grid grid-cols-2 border-b border-slate-200 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ["Present", monthStats.present, "text-emerald-800", "bg-emerald-500"],
          ["Late", monthStats.late, "text-orange-800", "bg-orange-500"],
          ["Absent", monthStats.absent, "text-rose-800", "bg-rose-500"],
          ["Leave", monthStats.leave, "text-blue-800", "bg-blue-500"],
          ["Work hours", formatDuration(monthStats.worked), "text-violet-800", "bg-violet-600"]
        ].map(([label, value, tone, bar]) => <div key={label} className="relative border-b border-r border-slate-200 p-3 last:border-r-0 lg:border-b-0"><span className={`absolute inset-x-0 top-0 h-1 ${bar}`} /><p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</p><strong className={`mt-1 block text-xl ${tone}`}>{value}</strong></div>)}
      </div>

      {calendarOpen && <div id="attendance-month-calendar" className="border-t border-slate-200 p-3 sm:p-4">
        <div className="flex flex-wrap gap-1.5 text-[9px] font-extrabold">{[["Present","bg-emerald-500"],["Late","bg-orange-500"],["Absent","bg-rose-500"],["Leave","bg-blue-500"],["Present + leave","bg-gradient-to-r from-emerald-500 to-blue-500"],["Sunday / off","bg-slate-500"],["Holiday","bg-violet-600"]].map(([label, color]) => <span key={label} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-700"><i className={`h-2 w-2 rounded-full ${color}`} />{label}</span>)}</div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(item => <strong key={item} className="py-1 text-[9px] uppercase tracking-wider text-slate-500 sm:text-[10px]">{item}</strong>)}
          {Array.from({ length: monthDate.getDay() }, (_, index) => <span key={`blank-${index}`} />)}
          {calendarDays.map(item => <div key={item.key} title={`${item.key}: ${item.status}${item.shiftName ? ` · ${item.shiftName}` : ""}${item.leaveType ? ` · ${item.leaveType} leave` : ""}${item.checkIn ? ` · ${item.checkIn}` : ""}${item.workedSeconds ? ` · ${formatDuration(item.workedSeconds)}` : ""}`} className={`relative min-h-12 overflow-hidden rounded-lg border p-1 sm:min-h-14 sm:p-1.5 ${item.isSplit ? "border-violet-800 bg-[linear-gradient(135deg,rgb(5_150_105)_0%,rgb(5_150_105)_49%,rgb(37_99_235)_50%,rgb(37_99_235)_100%)] text-white shadow-sm" : calendarStyles[item.status]}`}><strong className="relative block text-xs sm:text-sm">{item.day}</strong><span className="relative mt-0.5 block truncate text-[7px] font-extrabold leading-tight sm:text-[8px]">{item.status}</span>{item.checkIn && <span className="relative hidden truncate text-[8px] font-semibold text-white/90 lg:block">{item.checkIn} · {formatDuration(item.workedSeconds)}</span>}</div>)}
        </div>
        <p className="mt-2 text-[10px] text-slate-500">Sundays and weekly offs are not absences unless a special roster assigns work.</p>
      </div>}
    </section>

    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-violet-700" /><h2 className="text-sm font-extrabold uppercase tracking-widest text-slate-700">Attendance insights</h2></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-2"><p className="text-[10px] font-bold text-emerald-800">Attendance</p><strong className="block text-lg text-emerald-950">{monthStats.attendanceRate == null ? "—" : `${monthStats.attendanceRate}%`}</strong></div><div className="rounded-lg border border-blue-300 bg-blue-100 px-3 py-2"><p className="text-[10px] font-bold text-blue-800">Average check-in</p><strong className="block text-lg text-blue-950">{formatClockMinutes(monthStats.averageCheckInMinutes)}</strong></div><div className="rounded-lg border border-violet-300 bg-violet-100 px-3 py-2"><p className="text-[10px] font-bold text-violet-800">Average workday</p><strong className="block text-lg text-violet-950">{formatDuration(monthStats.averageWorkday)}</strong></div></div>
      {monthStats.averageLateMinutes > 0 && <div className="mt-2 flex items-start gap-2 rounded-lg border border-orange-300 bg-orange-100 px-3 py-2 text-xs font-semibold text-orange-950"><AlertTriangle className="h-4 w-4 shrink-0" /><span>You are arriving {monthStats.averageLateMinutes} minutes later than scheduled on average.</span></div>}
    </section>

    <div className="mt-8 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-600"><TimerReset className="h-4 w-4" />Daily time history</h2><label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"><Filter className="h-4 w-4" /><span className="sr-only">Filter attendance history</span><select value={historyFilter} onChange={event => setHistoryFilter(event.target.value)} className="bg-transparent outline-none"><option>All</option><option>Present</option><option>Late</option></select></label></div>
    <div className="mt-3 space-y-4">
      {filteredHistory.map(day => <article key={day.date} className="card overflow-hidden">
        <div className="flex items-center justify-between bg-slate-50 px-5 py-4">
          <div><strong>{day.date}</strong><p className="text-xs text-slate-500">{day.shifts.length} {day.shifts.length === 1 ? "shift" : "shifts"}</p></div>
          <strong className="text-xl text-blue-700">{formatDuration(day.totalSeconds)}</strong>
        </div>
        <div className="divide-y">
          {day.shifts.map(shift => <div key={shift.id} className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr_1fr_auto]">
            <div><p className="text-xs text-slate-500">Check-in</p><strong>{shift.checkIn}</strong></div>
            <div><p className="text-xs text-slate-500">Check-out</p><strong>{shift.checkOut || "Working now"}</strong></div>
            <div><p className="text-xs text-slate-500">Applied schedule</p><strong>{shift.shiftName || "No assigned shift"}</strong><p className="text-xs text-slate-500">{scheduledTime(shift) || "No scheduled time stored"}</p></div>
            <div><p className="text-xs text-slate-500">Gross / net time</p><strong>{formatDuration(durationSeconds(shift, now))} / {formatDuration(workedDurationSeconds(shift, management.breaks, now))}</strong><p className="text-xs text-slate-500">{breakMinutes(management.breaks, shift.id, "paid", now)} min paid · {breakMinutes(management.breaks, shift.id, "unpaid", now)} min unpaid</p><p className="text-xs text-slate-500">{shift.overtimeMinutes || 0} min overtime{shift.checkoutSource === "automatic" ? " · Auto checkout" : ""}</p></div>
            <Status value={shift.status} />
          </div>)}
        </div>
      </article>)}
      {!filteredHistory.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No attendance records match this month and filter.</div>}
    </div>
  </>;
}

export default function EmployeeAttendance() {
  const [tab, setTab] = useState("today");
  return <>
    <EmployeePageHeader title="Attendance" description="Work time, breaks, leave, and corrections in one place." />
    <div className="mb-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
      <button onClick={() => setTab("today")} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${tab === "today" ? "bg-violet-600 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}><Clock3 className="h-4 w-4" />Today & history</button>
      <button onClick={() => setTab("requests")} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${tab === "requests" ? "bg-violet-600 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}><CalendarRange className="h-4 w-4" />Leave & corrections</button>
    </div>
    {tab === "today" ? <AttendanceToday /> : <EmployeeAttendanceRequests />}
  </>;
}
