"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Download, MapPinned, Plus, RefreshCw, X } from "lucide-react";
import { apiJson } from "@/lib/apiClient";
import AttendanceLocations from "@/components/AttendanceLocations";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function DayPicker({ value, onChange }) {
  const selected = value || [];
  return <div className="flex flex-wrap gap-1.5">{dayNames.map((name, day) => <button type="button" key={name} onClick={() => onChange(selected.includes(day) ? selected.filter(item => item !== day) : [...selected, day].sort())} className={`rounded-lg px-2.5 py-2 text-xs font-bold ${selected.includes(day) ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>{name}</button>)}</div>;
}

function FormCard({ title, children }) {
  return <form onSubmit={event => event.preventDefault()} className="card p-5"><h3 className="font-bold">{title}</h3><div className="mt-4 space-y-3">{children}</div></form>;
}

function Badge({ value }) {
  const style = value === "Approved" || value === "Active"
    ? "bg-emerald-50 text-emerald-700"
    : value === "Rejected" || value === "Inactive"
      ? "bg-rose-50 text-rose-700"
      : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${style}`}>{value}</span>;
}

function downloadBlob(content, type, name) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function shiftSummary(template) {
  const [startHour, startMinute] = template.startTime.slice(0, 5).split(":").map(Number);
  const [endHour, endMinute] = template.endTime.slice(0, 5).split(":").map(Number);
  const elapsed = ((endHour * 60 + endMinute) - (startHour * 60 + startMinute) + 1440) % 1440;
  const paid = Math.max(0, elapsed - template.unpaidBreakMinutes);
  return `${Math.floor(paid / 60)}h ${paid % 60}m scheduled paid time`;
}

export default function AttendanceManagementPanel({ view }) {
  const [data, setData] = useState({ employees: [], templates: [], schedules: [], rosters: [], holidays: [], leaves: [], corrections: [], assignments: [], locations: [], teams: [], projects: [] });
  const [attendance, setAttendance] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [planningForm, setPlanningForm] = useState("shift");
  const [geofenceSubtab, setGeofenceSubtab] = useState("assignments");
  const [shiftDays, setShiftDays] = useState([0]);
  const [scheduleDays, setScheduleDays] = useState([1, 2, 3, 4, 5]);
  const [assignmentDays, setAssignmentDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [targetType, setTargetType] = useState("team");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    setError("");
    try {
      const from = `${month}-01`;
      const to = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
      const [management, records] = await Promise.all([
        apiJson(`/api/attendance-management?from=${from}&to=${to}`, { cache: "no-store" }),
        apiJson("/api/attendance", { cache: "no-store" })
      ]);
      setData(management.data);
      setAttendance(records.data);
    } catch (failure) {
      setError(failure.message);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  async function create(event, action, extra = {}) {
    event.preventDefault();
    const form = event.currentTarget.tagName === "FORM"
      ? event.currentTarget
      : event.currentTarget.closest("form");
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const body = { action, ...Object.fromEntries(new FormData(form)), ...extra };
      const payload = await apiJson("/api/attendance-management", { method: "POST", body: JSON.stringify(body) });
      setMessage(payload.message);
      form?.reset();
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function update(body) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const payload = await apiJson("/api/attendance-management", { method: "PATCH", body: JSON.stringify(body) });
      setMessage(payload.message);
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const payroll = useMemo(() => data.employees.map(employee => {
    const records = attendance.filter(item => item.employeeId === employee.id && item.date.startsWith(month) && item.checkOutAt);
    const leaveDays = data.leaves.filter(item => item.employeeId === employee.id && item.status === "Approved")
      .reduce((sum, item) => sum + Math.max(1, Math.round((new Date(item.endDate) - new Date(item.startDate)) / 86400000) + 1), 0);
    return {
      employee: employee.name,
      department: employee.department,
      days: new Set(records.map(item => item.date)).size,
      workedMinutes: records.reduce((sum, item) => sum + (item.workedMinutes || Math.floor(item.durationSeconds / 60)), 0),
      breakMinutes: records.reduce((sum, item) => sum + (item.breakMinutes || 0), 0),
      overtimeMinutes: records.reduce((sum, item) => sum + (item.overtimeMinutes || 0), 0),
      lateDays: new Set(records.filter(item => item.status === "Late").map(item => item.date)).size,
      leaveDays
    };
  }), [attendance, data.employees, data.leaves, month]);

  function exportPayroll(format) {
    const rows = [["Employee", "Department", "Days worked", "Work minutes", "Break minutes", "Overtime minutes", "Late days", "Approved leave days"], ...payroll.map(item => [item.employee, item.department, item.days, item.workedMinutes, item.breakMinutes, item.overtimeMinutes, item.lateDays, item.leaveDays])];
    if (format === "csv") {
      downloadBlob(rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n"), "text/csv;charset=utf-8", `fieldflow-payroll-${month}.csv`);
      return;
    }
    const html = `<html><head><meta charset="UTF-8"></head><body><table>${rows.map((row, index) => `<tr>${row.map(value => `<${index ? "td" : "th"}>${String(value)}</${index ? "td" : "th"}>`).join("")}</tr>`).join("")}</table></body></html>`;
    downloadBlob(html, "application/vnd.ms-excel", `fieldflow-payroll-${month}.xls`);
  }

  const notices = <>
    {message && <p className="mb-5 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</p>}
    {error && <p className="mb-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>}
  </>;

  if (view === "requests") {
    const requests = [
      ...data.leaves.map(item => ({ ...item, kind: "Leave", action: "review-leave", detail: `${item.type} · ${item.startDate} to ${item.endDate}` })),
      ...data.corrections.map(item => ({ ...item, kind: "Correction", action: "review-correction", detail: item.reason }))
    ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return <>{notices}<section className="card overflow-hidden"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-bold">Leave and correction requests</h2><p className="text-sm text-slate-500">Team scope is enforced by database permissions.</p></div><button onClick={load} className="btn-secondary"><RefreshCw className="h-4 w-4" />Refresh</button></div><div className="divide-y">{requests.map(item => <article key={`${item.kind}-${item.id}`} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">{item.kind}</p><strong>{item.employee}</strong><p className="mt-1 text-sm text-slate-500">{item.detail}</p>{item.kind === "Leave" && <p className="mt-2 text-sm">{item.reason}</p>}{item.reviewerComment && <p className="mt-2 text-sm text-blue-700">Reviewer: {item.reviewerComment}</p>}</div><Badge value={item.status} /></div>{item.status === "Pending" && <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={() => update({ action: item.action, id: item.id, status: "Approved", comment: "Approved." })} className="btn-primary"><Check className="h-4 w-4" />Approve</button><button disabled={busy} onClick={() => update({ action: item.action, id: item.id, status: "Rejected", comment: "Rejected by attendance reviewer." })} className="btn-secondary text-rose-700"><X className="h-4 w-4" />Reject</button></div>}</article>)}{!requests.length && <p className="p-10 text-center text-slate-500">No requests in this period.</p>}</div></section></>;
  }

  if (view === "geofences") {
    const targets = targetType === "team" ? data.teams : targetType === "employee" ? data.employees : targetType === "project" ? data.projects : [];
    return <>{notices}<div className="mb-5 flex gap-2"><button onClick={() => setGeofenceSubtab("assignments")} className={geofenceSubtab === "assignments" ? "btn-primary rounded-full" : "btn-secondary rounded-full"}>Assignments</button><button onClick={() => setGeofenceSubtab("locations")} className={geofenceSubtab === "locations" ? "btn-primary rounded-full" : "btn-secondary rounded-full"}>Locations & radius</button></div>{geofenceSubtab === "locations" ? <AttendanceLocations embedded /> : <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <form onSubmit={event => create(event, "geofence-assignment", { targetType, weekdays: assignmentDays })} className="card h-fit p-5"><h2 className="font-bold">Assign an attendance location</h2><p className="mt-1 text-sm text-slate-500">Limit by person, team, project, event, dates, days, and working hours.</p><div className="mt-5 space-y-3"><div><label className="label">Location</label><select name="locationId" required className="input"><option value="">Select location</option>{data.locations.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name} · {item.radiusM} m</option>)}</select></div><div><label className="label">Assign to</label><select value={targetType} onChange={event => setTargetType(event.target.value)} className="input"><option value="all">All employees</option><option value="team">Team</option><option value="employee">Employee</option><option value="project">Project</option></select></div>{targetType !== "all" && <div><label className="label">Target</label><select name="targetId" required className="input"><option value="">Select {targetType}</option>{targets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}<div><label className="label">Allowed event</label><select name="eventType" className="input"><option value="both">Check-in and check-out</option><option value="check-in">Check-in only</option><option value="check-out">Check-out only</option></select></div><div className="grid grid-cols-2 gap-3"><div><label className="label">Valid from</label><input name="validFrom" type="date" className="input" /></div><div><label className="label">Expires</label><input name="validUntil" type="date" className="input" /></div></div><div><label className="label">Allowed days</label><DayPicker value={assignmentDays} onChange={setAssignmentDays} /></div><div className="grid grid-cols-2 gap-3"><div><label className="label">From time</label><input name="windowStart" type="time" className="input" /></div><div><label className="label">Until time</label><input name="windowEnd" type="time" className="input" /></div></div><button disabled={busy} className="btn-primary w-full"><MapPinned className="h-4 w-4" />Create assignment</button></div></form>
      <section className="card overflow-hidden"><div className="border-b px-5 py-4"><h2 className="font-bold">Geofence rules</h2><p className="text-sm text-slate-500">Disable the initial “All employees” rule after creating scoped assignments.</p></div><div className="divide-y">{data.assignments.map(item => <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div><div className="flex flex-wrap items-center gap-2"><strong>{item.locationName}</strong><Badge value={item.active ? "Active" : "Inactive"} /></div><p className="mt-1 text-sm text-slate-500">{item.target} · {item.eventType}</p><p className="text-xs text-slate-500">{item.validFrom || "Now"} to {item.validUntil || "No expiry"}{item.windowStart && item.windowEnd ? ` · ${item.windowStart}–${item.windowEnd}` : ""}</p></div><button disabled={busy} onClick={() => update({ action: "toggle-assignment", id: item.id, active: !item.active })} className="btn-secondary">{item.active ? "Disable" : "Enable"}</button></article>)}{!data.assignments.length && <p className="p-10 text-center text-slate-500">No geofence assignments yet.</p>}</div></section>
    </div>}</>;
  }

  if (view === "payroll") {
    return <>{notices}<div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><label className="label">Payroll month</label><input value={month} onChange={event => setMonth(event.target.value)} type="month" className="input w-52" /></div><div className="flex gap-2"><button onClick={() => exportPayroll("csv")} className="btn-secondary"><Download className="h-4 w-4" />CSV</button><button onClick={() => exportPayroll("xls")} className="btn-primary"><Download className="h-4 w-4" />Excel</button></div></div><section className="card overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500"><tr><th className="px-5 py-4">Employee</th><th>Days</th><th>Work</th><th>Breaks</th><th>Overtime</th><th>Late</th><th>Leave</th></tr></thead><tbody>{payroll.map(item => <tr key={item.employee} className="border-t"><td className="px-5 py-4"><strong>{item.employee}</strong><p className="text-xs text-slate-500">{item.department}</p></td><td>{item.days}</td><td>{item.workedMinutes} min</td><td>{item.breakMinutes} min</td><td className="font-bold text-violet-700">{item.overtimeMinutes} min</td><td>{item.lateDays}</td><td>{item.leaveDays}</td></tr>)}</tbody></table></section></>;
  }

  return <>{notices}<div className="mb-5 flex gap-2 overflow-x-auto">{[["shift","Work shifts"],["schedule","Schedules"],["roster","Daily roster"],["holiday","Holidays"]].map(([key,label]) => <button key={key} onClick={() => setPlanningForm(key)} className={planningForm === key ? "btn-primary shrink-0 rounded-full" : "btn-secondary shrink-0 rounded-full"}>{label}</button>)}</div>
    {planningForm === "shift" && <div className="grid gap-6 xl:grid-cols-[420px_1fr]"><FormCard title={data.templates.length ? "Create another work shift" : "Create work shift"}><p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">Saving a shift creates a reusable template. Open <strong>Schedules</strong> afterward to assign it to employees.</p><div><label className="label">Name</label><input name="name" required className="input" placeholder="General shift" /></div><div className="grid grid-cols-2 gap-3"><div><label className="label">Start</label><input name="startTime" type="time" required className="input" /></div><div><label className="label">End</label><input name="endTime" type="time" required className="input" /></div></div><div className="grid grid-cols-3 gap-2"><div><label className="label">Break min</label><input name="unpaidBreakMinutes" type="number" min="0" max="480" defaultValue="30" className="input" /></div><div><label className="label">Grace min</label><input name="graceMinutes" type="number" min="0" max="180" defaultValue="15" className="input" /></div><div><label className="label">Missed checkout after</label><input name="autoCheckoutAfterMinutes" type="number" min="15" max="720" defaultValue="120" className="input" /></div></div><div><label className="label">Weekly offs</label><DayPicker value={shiftDays} onChange={setShiftDays} /></div><button disabled={busy} onClick={event => create(event, "shift-template", { weeklyOffDays: shiftDays })} className="btn-primary w-full"><Plus className="h-4 w-4" />Create shift</button></FormCard><section className="card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><h2 className="font-bold">Work shift templates</h2><p className="text-sm text-slate-500">{data.templates.length} saved · {data.schedules.length} schedule assignment{data.schedules.length === 1 ? "" : "s"} in this period</p></div>{data.templates.some(item => item.active) && <button onClick={() => setPlanningForm("schedule")} className="btn-primary">Next: assign schedules</button>}</div><div className="divide-y">{data.templates.map(item => { const assigned = data.schedules.filter(schedule => schedule.shiftTemplateId === item.id).length; return <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-5"><div><div className="flex flex-wrap items-center gap-2"><strong>{item.name}</strong><Badge value={item.active ? "Active" : "Inactive"} /></div><p className="text-sm text-slate-500">{item.startTime}–{item.endTime} · {item.graceMinutes} min grace · {item.unpaidBreakMinutes} min break</p><p className="text-xs text-slate-500">{shiftSummary(item)} · Weekly off: {item.weeklyOffDays.map(day => dayNames[day]).join(", ") || "None"} · {assigned ? `${assigned} assigned schedule${assigned === 1 ? "" : "s"}` : "Not assigned yet"}</p></div><button onClick={() => update({ action: "toggle-shift", id: item.id, active: !item.active })} className="btn-secondary">{item.active ? "Disable" : "Enable"}</button></article>;})}{!data.templates.length && <p className="p-10 text-center text-slate-500">No work shifts yet. Create the first shift using the form.</p>}</div></section></div>}
    {planningForm === "schedule" && <div className="grid gap-6 xl:grid-cols-[420px_1fr]"><FormCard title="Assign regular schedule"><div><label className="label">Employee</label><select name="employeeId" required className="input"><option value="">Select employee</option>{data.employees.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div><label className="label">Work shift</label><select name="shiftTemplateId" required className="input"><option value="">Select shift</option>{data.templates.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><div><label className="label">Effective from</label><input name="effectiveFrom" type="date" required className="input" /></div><div><label className="label">Effective to</label><input name="effectiveTo" type="date" className="input" /></div></div><div><label className="label">Working days</label><DayPicker value={scheduleDays} onChange={setScheduleDays} /></div><button disabled={busy} onClick={event => create(event, "schedule", { weekdays: scheduleDays })} className="btn-primary w-full">Assign schedule</button></FormCard><section className="card overflow-hidden"><div className="border-b px-5 py-4"><h2 className="font-bold">Employee schedules</h2></div><div className="divide-y">{data.schedules.map(item => <article key={item.id} className="p-5"><strong>{item.employee}</strong><p className="text-sm text-slate-500">{item.shiftName} · {item.effectiveFrom} to {item.effectiveTo || "ongoing"}</p><p className="text-xs text-slate-500">{item.weekdays.map(day => dayNames[day]).join(", ")}</p></article>)}</div></section></div>}
    {planningForm === "roster" && <div className="grid gap-6 xl:grid-cols-[420px_1fr]"><FormCard title="Set daily roster override"><div><label className="label">Employee</label><select name="employeeId" required className="input"><option value="">Select employee</option>{data.employees.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><div><label className="label">Date</label><input name="workDate" type="date" required className="input" /></div><div><label className="label">Shift</label><select name="shiftTemplateId" required className="input"><option value="">Select</option>{data.templates.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></div><div><label className="label">Required check-in location</label><select name="checkInLocationId" className="input"><option value="">Use assigned geofences</option>{data.locations.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div><label className="label">Required check-out location</label><select name="checkOutLocationId" className="input"><option value="">Use assigned geofences</option>{data.locations.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div><label className="label">Notes</label><textarea name="notes" className="input min-h-20" /></div><button disabled={busy} onClick={event => create(event, "roster")} className="btn-primary w-full">Save roster</button></FormCard><section className="card overflow-hidden"><div className="border-b px-5 py-4"><h2 className="font-bold">Roster overrides</h2></div><div className="divide-y">{data.rosters.map(item => <article key={item.id} className="p-5"><strong>{item.employee}</strong><p className="text-sm text-slate-500">{item.workDate} · {item.shiftName}</p>{item.notes && <p className="mt-1 text-xs">{item.notes}</p>}</article>)}</div></section></div>}
    {planningForm === "holiday" && <div className="grid gap-6 xl:grid-cols-[420px_1fr]"><FormCard title="Add holiday"><div><label className="label">Holiday name</label><input name="name" required className="input" /></div><div><label className="label">Date</label><input name="date" type="date" required className="input" /></div><div><label className="label">Location (optional)</label><select name="locationId" className="input"><option value="">All locations</option>{data.locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><button disabled={busy} onClick={event => create(event, "holiday")} className="btn-primary w-full"><CalendarDays className="h-4 w-4" />Add holiday</button></FormCard><section className="card overflow-hidden"><div className="border-b px-5 py-4"><h2 className="font-bold">Holiday calendar</h2></div><div className="divide-y">{data.holidays.map(item => <article key={item.id} className="p-5"><strong>{item.name}</strong><p className="text-sm text-slate-500">{item.date} · {item.locationName || "All locations"}</p></article>)}</div></section></div>}
  </>;
}
