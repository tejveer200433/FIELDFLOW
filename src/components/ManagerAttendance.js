"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, CheckCircle2, ClipboardCheck, Clock3, Download, MapPinned, TimerReset, UsersRound, WalletCards } from "lucide-react";
import { durationSeconds, formatDuration } from "@/lib/time";
import { apiJson } from "@/lib/apiClient";
import AttendanceManagementPanel from "@/components/AttendanceManagementPanel";
import { useAccess } from "@/components/AccessContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

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
  const [items, setItems] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [message, setMessage] = useState("");
  const load = useCallback(() => apiJson("/api/attendance", { cache: "no-store" })
    .then(payload => setItems(payload.data))
    .catch(error => setMessage(error.message)), []);

  useEffect(() => {
    load();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(load, 5000);
    return () => {
      clearInterval(clock);
      clearInterval(refresh);
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
        totalSeconds: group.shifts.reduce((sum, item) => sum + durationSeconds(item, now), 0),
        late: group.shifts.some(item => item.status === "Late")
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.employee.localeCompare(b.employee));
  }, [items, now]);

  const active = items.filter(item => !item.checkOutAt && !item.checkOut);
  const overdue = active.filter(item => item.missedCheckout);
  const completed = items.filter(item => item.checkOutAt || item.checkOut);
  const totalSeconds = completed.reduce((sum, item) => sum + durationSeconds(item), 0);

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

    <div className="grid gap-5 sm:grid-cols-3">
      <Metric label="Currently on duty" value={active.length} icon={UsersRound} tone="bg-emerald-50 text-emerald-600" />
      <Metric label="Completed shifts" value={completed.length} icon={CheckCircle2} tone="bg-blue-50 text-blue-600" />
      <Metric label="Recorded work time" value={formatDuration(totalSeconds)} icon={Clock3} tone="bg-violet-50 text-violet-600" />
    </div>

    {active.length > 0 && <section className="card mt-7 p-6">
      <h2 className="flex items-center gap-2 font-bold"><TimerReset className="h-5 w-5 text-blue-600" />Live shifts</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {active.map(item => <div key={item.id} className="rounded-2xl bg-blue-50 p-4">
          <div className="flex justify-between"><strong>{item.employee}</strong><span className="text-xs font-bold text-emerald-600">ON DUTY</span></div>
          <p className="mt-1 text-sm text-slate-500">Checked in at {item.checkIn}{item.checkInLocation?.geofenceName ? ` · ${item.checkInLocation.geofenceName}` : ""}</p>
          {item.checkInLocation?.distanceM != null && <p className="text-xs text-slate-500">{Math.round(item.checkInLocation.distanceM)} m from location</p>}
          <p className="mt-3 font-mono text-2xl font-bold text-blue-700">{formatDuration(durationSeconds(item, now))}</p>
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
        <tbody>{items.map(row => <tr key={row.id} className="border-t align-top"><td className="px-5 py-4 font-bold">{row.employee}</td><td className="py-4">{row.date}</td><td className="py-4">{row.checkIn}</td><td className="py-4">{row.checkOut || "Working now"}</td><td className="py-4"><strong>{formatDuration(durationSeconds(row, now))}</strong>{(row.breakMinutes > 0 || row.overtimeMinutes > 0) && <p className="text-xs text-slate-500">{row.breakMinutes} min break · {row.overtimeMinutes} min overtime</p>}</td><td className="py-4 pr-4"><GeofenceResult location={row.checkInLocation} label="Check-in" /></td><td className="py-4 pr-4"><GeofenceResult location={row.checkOutLocation} label="Check-out" /></td></tr>)}</tbody>
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
    ...(canConfigure ? [["geofences", "Geofences", MapPinned]] : []),
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
