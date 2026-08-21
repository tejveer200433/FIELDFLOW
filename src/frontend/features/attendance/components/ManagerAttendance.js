"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarRange, CheckCircle2, ClipboardCheck, Clock3, Coffee, Download, MapPinned, ShieldCheck, TimerReset, UsersRound, WalletCards } from "lucide-react";
import { formatDuration } from "@/shared/time";
import { apiJson } from "@/frontend/lib/apiClient";
import AttendanceManagementPanel from "@/frontend/features/attendance/components/AttendanceManagementPanel";
import { useAccess } from "@/frontend/contexts/AccessContext";
import { hasPermission, PERMISSIONS } from "@/shared/permissions";
import { workedDurationSeconds } from "@/shared/employeeDashboard";

function Metric({ label, value, icon: Icon, tone }) {
  return <div className="card p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p><p className="mt-3 text-3xl font-extrabold">{value}</p></div><span className={`grid h-12 w-12 place-items-center rounded-full ${tone}`}><Icon /></span></div></div>;
}

function Pill({ value }) {
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${value === "Late" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{value}</span>;
}

function mapUrl(location) {
  return `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}`;
}

function GeofenceResult({ location, label }) {
  if (!location) return <span className="text-slate-400">—</span>;
  return <div className="min-w-32 text-sm">
    <a target="_blank" rel="noreferrer" className="font-bold text-blue-600" href={mapUrl(location)}>{label} map</a>
    {location.geofenceName && <p className="mt-1 font-semibold text-slate-700">{location.geofenceName}</p>}
    {location.distanceM != null && <p className="text-xs text-slate-500">{Math.round(location.distanceM)} m from location</p>}
  </div>;
}

function AttendanceOverview() {
  const access = useAccess();
  const loadRequest = useRef(null);
  const [items, setItems] = useState([]);
  const [management, setManagement] = useState({ breaks: [], anomalies: [], employees: [], leaves: [], rosters: [], schedules: [] });
  const [liveLocations, setLiveLocations] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [message, setMessage] = useState("");
  const load = useCallback(() => {
    if (loadRequest.current) return loadRequest.current;
    const canViewLocations = hasPermission(access, PERMISSIONS.locationsViewTeam) || hasPermission(access, PERMISSIONS.locationsViewAll);
    const request = Promise.all([
      apiJson("/api/attendance", { cache: "no-store" }),
      apiJson("/api/attendance-management", { cache: "no-store" }),
      canViewLocations ? apiJson("/api/locations", { cache: "no-store" }) : Promise.resolve({ data: [] })
    ])
      .then(([payload, attendanceManagement, locations]) => { setItems(payload.data); setManagement(attendanceManagement.data); setLiveLocations(locations.data); setMessage(""); })
      .catch(error => setMessage(error.message))
      .finally(() => { loadRequest.current = null; });
    loadRequest.current = request;
    return request;
  }, [access]);

  useEffect(() => {
    load();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) load();
    };
    const refresh = setInterval(refreshWhenVisible, 15000);
    window.addEventListener("online", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      clearInterval(clock);
      clearInterval(refresh);
      window.removeEventListener("online", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);

  const daily = useMemo(() => {
    const groups = new Map();
    items.forEach(item => {
      const key = `${item.employeeId}:${item.date}`;
      if (!groups.has(key)) groups.set(key, { employee: item.employee, employeeId: item.employeeId, date: item.date, shifts: [] });
      groups.get(key).shifts.push(item);
    });
    return Array.from(groups.values())
      .map(group => ({
        ...group,
        firstCheckIn: [...group.shifts].sort((a, b) => String(a.checkIn).localeCompare(String(b.checkIn)))[0]?.checkIn,
        lastCheckOut: group.shifts.every(item => item.checkOut)
          ? [...group.shifts].sort((a, b) => String(b.checkOut).localeCompare(String(a.checkOut)))[0]?.checkOut
          : "Working now",
        totalSeconds: group.shifts.reduce((sum, item) => sum + workedDurationSeconds(item, management.breaks, now), 0),
        late: group.shifts.some(item => item.status === "Late")
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.employee.localeCompare(b.employee));
  }, [items, management.breaks, now]);

  const active = items.filter(item => !item.checkOutAt && !item.checkOut);
  const overdue = active.filter(item => item.checkoutWarning);
  const onBreak = active.filter(item => management.breaks.some(entry => entry.shiftId === item.id && !entry.endedAt));
  const locationOffline = active.filter(item => !liveLocations.some(location => location.employeeId === item.employeeId));
  const openAnomalies = management.anomalies.filter(item => item.status === "open");
  const completed = items.filter(item => item.checkOutAt || item.checkOut);
  const totalSeconds = completed.reduce((sum, item) => sum + workedDurationSeconds(item, management.breaks), 0);
  const todayKey = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  const todayItems = items.filter(item => item.date === todayKey);
  const lateToday = new Set(todayItems.filter(item => item.status === "Late").map(item => item.employeeId)).size;
  const approvedLeave = new Set((management.leaves || []).filter(item => item.status === "Approved" && item.startDate <= todayKey && item.endDate >= todayKey).map(item => item.employeeId));
  const recordedToday = new Set(todayItems.map(item => item.employeeId));
  const rosteredToday = new Set((management.rosters || []).filter(item => item.workDate === todayKey).map(item => item.employeeId));
  const weekday = new Date(`${todayKey}T12:00:00`).getDay();
  const scheduledToday = new Set((management.schedules || []).filter(item => item.effectiveFrom <= todayKey && (!item.effectiveTo || item.effectiveTo >= todayKey) && item.weekdays.includes(weekday)).map(item => item.employeeId));
  const expectedToday = new Set([...rosteredToday, ...scheduledToday]);
  const absentToday = [...expectedToday].filter(id => !recordedToday.has(id) && !approvedLeave.has(id)).length;

  function download() {
    const rows = [
      ["Employee", "Date", "First check-in", "Last check-out", "Shifts", "Total time"],
      ...daily.map(item => [item.employee, item.date, item.firstCheckIn, item.lastCheckOut, item.shifts.length, formatDuration(item.totalSeconds)])
    ];
    const blob = new Blob([rows.map(row => row.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fieldflow-daily-attendance.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return <>
    <div className="mb-5 flex justify-end">
      <button onClick={download} className="btn-secondary"><Download className="h-4 w-4" />Export daily totals</button>
    </div>

    {message && <p className="mb-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{message}</p>}
    {overdue.length > 0 && <p className="mb-5 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-700">{overdue.length} employee{overdue.length === 1 ? "" : "s"} missed the scheduled checkout reminder: {overdue.map(item => item.employee).join(", ")}.</p>}

    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Currently on duty" value={active.length} icon={UsersRound} tone="bg-emerald-50 text-emerald-600" />
      <Metric label="On break" value={onBreak.length} icon={Coffee} tone="bg-amber-50 text-amber-600" />
      <Metric label="Late today" value={lateToday} icon={TimerReset} tone="bg-orange-50 text-orange-600" />
      <Metric label="Absent today" value={absentToday} icon={UsersRound} tone="bg-slate-100 text-slate-600" />
      <Metric label="Missed checkout" value={overdue.length} icon={Clock3} tone="bg-amber-50 text-amber-700" />
      <Metric label="Location offline/stale" value={locationOffline.length} icon={MapPinned} tone="bg-slate-100 text-slate-600" />
      <Metric label="Completed shifts" value={completed.length} icon={CheckCircle2} tone="bg-blue-50 text-blue-600" />
      <Metric label="Recorded work time" value={formatDuration(totalSeconds)} icon={Clock3} tone="bg-violet-50 text-violet-600" />
      <Metric label="Needs review" value={openAnomalies.length} icon={AlertTriangle} tone="bg-rose-50 text-rose-600" />
    </div>

    {active.length > 0 && <section className="card mt-7 p-6">
      <h2 className="flex items-center gap-2 font-bold"><TimerReset className="h-5 w-5 text-blue-600" />Live shifts</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {active.map(item => <div key={item.id} className="rounded-2xl bg-blue-50 p-4">
          <div className="flex justify-between"><strong>{item.employee}</strong><span className={`text-xs font-bold ${onBreak.some(entry => entry.id === item.id) ? "text-amber-600" : "text-emerald-600"}`}>{onBreak.some(entry => entry.id === item.id) ? "ON BREAK" : "ON DUTY"}</span></div>
          <p className="mt-1 text-sm text-slate-500">Checked in at {item.checkIn}{item.checkInLocation?.geofenceName ? ` · ${item.checkInLocation.geofenceName}` : ""}</p>
          {item.checkInLocation?.distanceM != null && <p className="text-xs text-slate-500">{Math.round(item.checkInLocation.distanceM)} m from location</p>}
          {locationOffline.some(entry => entry.id === item.id) && <p className="mt-2 text-xs font-bold text-amber-700">Live location is offline or stale</p>}
          <p className="mt-3 font-mono text-2xl font-bold text-blue-700">{formatDuration(workedDurationSeconds(item, management.breaks, now))}</p>
          {item.riskScore > 0 && <p className="mt-2 text-xs font-bold text-rose-600">Risk score {item.riskScore} · {item.riskFlags.join(", ")}</p>}
        </div>)}
      </div>
    </section>}

    <section className="card mt-7 overflow-x-auto">
      <div className="border-b px-5 py-4"><h2 className="font-bold">Daily employee totals</h2><p className="text-sm text-slate-500">Multiple shifts on the same day are added together.</p></div>
      <table className="min-w-full text-left">
        <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500"><tr><th className="px-5 py-4">Employee</th><th>Date</th><th>First check-in</th><th>Last check-out</th><th>Shifts</th><th>Total time</th><th>Status</th></tr></thead>
        <tbody>{daily.map(row => <tr key={`${row.employeeId}-${row.date}`} className="border-t"><td className="px-5 py-4 font-bold">{row.employee}</td><td>{row.date}</td><td>{row.firstCheckIn}</td><td>{row.lastCheckOut}</td><td>{row.shifts.length}</td><td className="font-mono text-base font-bold text-blue-700">{formatDuration(row.totalSeconds)}</td><td><Pill value={row.late ? "Late" : "On time"} /></td></tr>)}</tbody>
      </table>
    </section>

    <section className="card mt-7 overflow-x-auto">
      <div className="border-b px-5 py-4"><h2 className="font-bold">Individual shift records</h2><p className="text-sm text-slate-500">GPS links and server-calculated geofence distances are retained for each event.</p></div>
      <table className="min-w-full text-left">
        <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500"><tr><th className="px-5 py-4">Employee</th><th>Date</th><th>Check-in</th><th>Check-out</th><th>Shift time</th><th>Check-in GPS</th><th>Check-out GPS</th></tr></thead>
        <tbody>{items.map(row => <tr key={row.id} className="border-t align-top"><td className="px-5 py-4 font-bold">{row.employee}{row.riskScore > 0 && <p className="text-xs text-rose-600">Risk {row.riskScore}</p>}</td><td className="py-4">{row.date}</td><td className="py-4">{row.checkIn}</td><td className="py-4">{row.checkOut || "Working now"}{row.checkoutSource === "automatic" && <p className="text-xs text-amber-600">Auto checkout</p>}</td><td className="py-4"><strong>{formatDuration(workedDurationSeconds(row, management.breaks, now))} net</strong><p className="text-xs text-slate-500">{row.grossMinutes || 0} min gross · {row.breakMinutes || 0} min breaks · {row.overtimeMinutes || 0} min overtime</p></td><td className="py-4 pr-4"><GeofenceResult location={row.checkInLocation} label="Check-in" /></td><td className="py-4 pr-4"><GeofenceResult location={row.checkOutLocation} label="Check-out" /></td></tr>)}</tbody>
      </table>
    </section>
  </>;
}

export default function ManagerAttendance() {
  const access = useAccess();
  const canApprove = hasPermission(access, PERMISSIONS.attendanceApprove);
  const canConfigure = hasPermission(access, PERMISSIONS.settingsManage);
  const tabs = [
    ["overview", "Overview", Clock3],
    ...(canApprove ? [["planning", "Planning", CalendarRange], ["requests", "Requests", ClipboardCheck]] : []),
    ...(canConfigure ? [["geofences", "Geofences", MapPinned], ["privacy", "Privacy & risk", ShieldCheck]] : []),
    ...(canApprove ? [["payroll", "Payroll", WalletCards]] : [])
  ];
  const [tab, setTab] = useState("overview");
  return <>
    <div className="mb-7">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Attendance</h1>
      <p className="mt-2 text-slate-500">Daily records, workforce planning, requests, geofences, and payroll summaries.</p>
    </div>
    <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
      {tabs.map(([key, label, Icon]) => <button key={key} onClick={() => setTab(key)} className={tab === key ? "btn-primary shrink-0 rounded-full" : "btn-secondary shrink-0 rounded-full"}><Icon className="h-4 w-4" />{label}</button>)}
    </div>
    {tab === "overview" ? <AttendanceOverview /> : <AttendanceManagementPanel view={tab} />}
  </>;
}
