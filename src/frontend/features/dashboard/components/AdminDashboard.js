"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, BriefcaseBusiness, CheckCircle2, MapPin, Navigation, RefreshCw, ShieldAlert, UserRoundCheck, WifiOff } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import LiveTeamMap from "@/frontend/components/maps/LiveTeamMap";
import { apiJson } from "@/frontend/lib/apiClient";
import { hasAnyPermission, PERMISSIONS } from "@/shared/permissions";

const workspaceTimeZone = "Asia/Kolkata";

function localDayKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: workspaceTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function initials(name = "Team member") {
  return name.split(" ").filter(Boolean).map(part => part[0]).slice(0, 2).join("").toUpperCase();
}

function statusStyle(status) {
  if (status === "Completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "In Progress") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "On The Way") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "Blocked") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function Metric({ icon: Icon, label, value, detail, tone, change }) {
  const iconTone = { green: "bg-emerald-500", blue: "bg-blue-600", cyan: "bg-cyan-500", gray: "bg-slate-400", red: "bg-rose-500" }[tone];
  const changeTone = tone === "red" || tone === "gray" ? "text-rose-500" : "text-emerald-600";
  return <article className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-[0_3px_12px_rgba(15,23,42,0.035)]">
    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-white ${iconTone}`}><Icon className="h-5 w-5" /></span>
    <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-600">{label}</p><div className="mt-0.5 flex items-end gap-2"><strong className="text-2xl font-black leading-none tracking-tight text-slate-950">{value}</strong><span className={`text-[10px] font-bold ${changeTone}`}>{change}</span></div><p className="mt-1 truncate text-[10px] text-slate-400">{detail}</p></div>
  </article>;
}

function Empty({ children }) {
  return <div className="grid min-h-28 place-items-center px-6 text-center text-xs font-semibold text-slate-400">{children}</div>;
}

export default function AdminDashboard({ access }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState({ tasks: [], attendance: [], employees: [], sos: [] });
  const [serviceState, setServiceState] = useState({ tasks: "loading", attendance: "loading", employees: "loading", sos: "loading" });
  const [loadVersion, setLoadVersion] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  useEffect(() => {
    let active = true;
    const allowed = async (service, permissions, endpoint) => {
      if (!hasAnyPermission(access, permissions)) return { service, status: "unavailable", data: [] };
      try {
        const payload = await apiJson(endpoint, { cache: "no-store" });
        if (!Array.isArray(payload.data)) throw new Error("Invalid service response");
        return { service, status: "ready", data: payload.data };
      } catch {
        return { service, status: "error", data: [] };
      }
    };
    setServiceState({ tasks: "loading", attendance: "loading", employees: "loading", sos: "loading" });
    Promise.all([
      allowed("tasks", [PERMISSIONS.tasksAssign, PERMISSIONS.tasksManageAll], "/api/tasks"),
      allowed("attendance", [PERMISSIONS.attendanceViewTeam, PERMISSIONS.attendanceViewAll], "/api/attendance"),
      allowed("employees", [PERMISSIONS.employeesViewAll, PERMISSIONS.tasksAssign], "/api/employees"),
      allowed("sos", [PERMISSIONS.sosViewTeam], "/api/sos")
    ]).then(results => {
      if (!active) return;
      setSnapshot(Object.fromEntries(results.map(result => [result.service, result.data])));
      setServiceState(Object.fromEntries(results.map(result => [result.service, result.status])));
      setLastRefreshed(new Date());
    });
    return () => { active = false; };
  }, [access, loadVersion]);

  useEffect(() => {
    const servicesReady = Object.values(serviceState).every(status => status !== "loading");
    if (servicesReady) {
      setMapReady(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setMapReady(true), 2000);
    return () => window.clearTimeout(timer);
  }, [serviceState]);

  const data = useMemo(() => {
    const activeIds = new Set(snapshot.attendance.filter(item => !item.checkOut).map(item => item.employeeId));
    const approved = snapshot.employees.filter(employee => employee.approvalStatus === "approved");
    const pendingEmployees = snapshot.employees.filter(employee => employee.approvalStatus === "pending");
    const activeTasks = snapshot.tasks.filter(task => task.status !== "Completed" && !task.archived);
    const travellingTasks = activeTasks.filter(task => task.status === "On The Way");
    const siteTasks = activeTasks.filter(task => task.status === "In Progress");
    const blockedTasks = activeTasks.filter(task => task.status === "Blocked");
    const completedToday = snapshot.tasks.filter(task => task.status === "Completed" && task.updatedAt && localDayKey(task.updatedAt) === localDayKey());
    const priority = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
    const dispatch = [...activeTasks].sort((left, right) => (priority[left.priority] ?? 4) - (priority[right.priority] ?? 4)).slice(0, 4);
    const trend = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - offset));
      const key = localDayKey(date);
      return { day: date.toLocaleDateString("en", { weekday: "short", timeZone: workspaceTimeZone }), completed: snapshot.tasks.filter(task => task.status === "Completed" && task.updatedAt && localDayKey(task.updatedAt) === key).length };
    });
    const alerts = [
      ...snapshot.sos.map(item => ({ id: `sos-${item.id}`, title: `SOS · ${item.employee || "Team member"}`, detail: item.message || "Immediate assistance requested", severity: "High", href: "/admin/map" })),
      ...blockedTasks.map(item => ({ id: `task-${item.id}`, title: "Blocked assignment", detail: item.title, severity: item.priority || "Medium", href: "/admin/field-tasks" })),
      ...pendingEmployees.map(item => ({ id: `employee-${item.id}`, title: "Account approval", detail: item.name || item.email, severity: "Review", href: "/admin/employees" }))
    ].slice(0, 3);
    return { activeIds, approved, activeTasks, travellingTasks, siteTasks, blockedTasks, completedToday, dispatch, trend, alerts };
  }, [snapshot]);

  const attendanceReady = serviceState.attendance === "ready";
  const employeesReady = serviceState.employees === "ready";
  const tasksReady = serviceState.tasks === "ready";
  const sosReady = serviceState.sos === "ready";
  const failedServices = Object.entries(serviceState).filter(([, status]) => status === "error").map(([service]) => service);
  const totalEmployees = snapshot.employees.length;
  const onDuty = data.activeIds.size;
  const offline = Math.max(0, totalEmployees - onDuty);
  const coverage = totalEmployees ? Math.round(onDuty / totalEmployees * 100) : 0;
  const taskCoverage = snapshot.tasks.length ? Math.round(data.completedToday.length / snapshot.tasks.length * 100) : 0;

  return <div className="mx-auto max-w-[1600px] space-y-4">
    <div className="flex items-center justify-between gap-4 lg:hidden"><div><h1 className="text-2xl font-black tracking-tight text-slate-950">Live Operations</h1><p className="text-xs text-slate-500">Real-time workforce and site coverage</p></div><button aria-label="Refresh dashboard" onClick={() => setLoadVersion(version => version + 1)} className="grid h-10 w-10 place-items-center rounded-lg bg-blue-600 text-white"><RefreshCw className="h-4 w-4" /></button></div>

    {failedServices.length > 0 && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800"><span><strong>Some services could not be loaded:</strong> {failedServices.join(", ")}. Unavailable totals are shown as dashes.</span><button onClick={() => setLoadVersion(version => version + 1)} className="rounded-lg border border-rose-200 bg-white px-3 py-2 font-bold">Retry</button></div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric icon={UserRoundCheck} label="On Duty" value={attendanceReady ? onDuty : "—"} change={employeesReady ? `↑ ${coverage}%` : ""} detail="Current attendance" tone="green" />
      <Metric icon={Navigation} label="In Transit" value={tasksReady ? data.travellingTasks.length : "—"} change={tasksReady ? `↑ ${data.activeTasks.length}` : ""} detail="Active assignments" tone="blue" />
      <Metric icon={BriefcaseBusiness} label="At Job Sites" value={tasksReady ? data.siteTasks.length : "—"} change={tasksReady ? `↑ ${data.completedToday.length}` : ""} detail="Work in progress" tone="cyan" />
      <Metric icon={WifiOff} label="Offline" value={attendanceReady && employeesReady ? offline : "—"} change={employeesReady ? `${totalEmployees}` : ""} detail="People not on duty" tone="gray" />
      <Metric icon={ShieldAlert} label="SOS / Alerts" value={sosReady ? snapshot.sos.length : "—"} change={data.blockedTasks.length ? `↑ ${data.blockedTasks.length}` : "0"} detail="Immediate attention" tone="red" />
    </section>

    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.72fr)_minmax(330px,.92fr)]">
      <article className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="absolute right-4 top-4 z-[500] flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-[11px] font-bold text-slate-700 shadow-lg"><span className="h-2 w-2 rounded-full bg-emerald-500" />{lastRefreshed ? "Synced just now" : "Connecting…"}</div>
        <div className="h-[555px] overflow-hidden bg-slate-100 [&>div]:!block [&>div>div]:!h-[555px] [&>div>div]:!min-h-0 [&_.leaflet-container]:!h-[555px] [&_aside]:!hidden">{mapReady ? <LiveTeamMap /> : <div className="grid h-full place-items-center text-sm font-bold text-slate-400"><span className="animate-pulse">Preparing live operations map…</span></div>}</div>
      </article>

      <div className="grid gap-4 xl:grid-rows-[1.1fr_.9fr]">
        <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4"><h2 className="text-sm font-black text-slate-950">Dispatch Queue</h2><button onClick={() => router.push("/admin/field-tasks")} className="text-xs font-bold text-blue-600">View all</button></div>
          <div className="divide-y divide-slate-100">{data.dispatch.map((task, index) => <button key={task.id} onClick={() => router.push("/admin/field-tasks")} className="grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-50"><span className="grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-[10px] font-black text-white">{index + 1}</span><span className="min-w-0"><small className="block text-[10px] text-slate-400">{task.scheduledAt ? new Date(task.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : task.priority || "Scheduled"}</small><strong className="mt-0.5 block truncate text-xs text-slate-900">{task.title}</strong><small className="mt-0.5 block truncate text-[10px] text-slate-500">{task.employee || "Unassigned"}{task.address ? ` · ${task.address}` : ""}</small></span><span className={`rounded-md border px-2 py-1 text-[9px] font-bold ${statusStyle(task.status)}`}>{task.status}</span></button>)}{tasksReady && !data.dispatch.length && <Empty>No active assignments need dispatch.</Empty>}</div>
        </article>

        <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4"><h2 className="text-sm font-black text-slate-950">Alerts</h2><button onClick={() => router.push("/admin/field-tasks")} className="text-xs font-bold text-blue-600">View all</button></div>
          <div className="divide-y divide-slate-100">{data.alerts.map(alert => <button key={alert.id} onClick={() => router.push(alert.href)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${alert.severity === "High" ? "bg-rose-50 text-rose-500" : "bg-orange-50 text-orange-500"}`}>{alert.severity === "High" ? <ShieldAlert className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-900">{alert.title} <i className="ml-1 rounded bg-rose-50 px-1.5 py-0.5 text-[8px] not-italic text-rose-500">{alert.severity}</i></strong><small className="mt-1 block truncate text-[10px] text-slate-500">{alert.detail}</small></span><ArrowRight className="h-3.5 w-3.5 text-slate-400" /></button>)}{!data.alerts.length && <Empty><span><CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-emerald-500" />No urgent operational alerts.</span></Empty>}</div>
        </article>
      </div>
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.15fr_.82fr_.92fr]">
      <article className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between"><h2 className="text-sm font-black text-slate-950">Team Roster ({employeesReady ? totalEmployees : "—"})</h2><button onClick={() => router.push("/admin/employees")} className="text-xs font-bold text-blue-600">View all</button></div>
        <div className="mt-4 grid grid-cols-5 gap-2">{snapshot.employees.slice(0, 5).map(employee => { const name = employee.name || employee.full_name || "Team member"; const active = data.activeIds.has(employee.id); const assignment = snapshot.tasks.find(task => task.employeeId === employee.id && task.status !== "Completed"); return <button key={employee.id} onClick={() => router.push("/admin/employees")} className="min-w-0 text-center"><span className="relative mx-auto grid h-10 w-10 place-items-center rounded-full bg-slate-200 text-[10px] font-black text-slate-700">{initials(name)}<i className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white ${active ? "bg-emerald-500" : "bg-slate-400"}`} /></span><strong className="mt-2 block truncate text-[10px] text-slate-800">{name.split(" ")[0]}</strong><small className={`mt-0.5 block truncate text-[8px] font-semibold ${active ? "text-emerald-600" : "text-slate-400"}`}>{assignment?.status || (active ? "On duty" : "Offline")}</small></button>; })}{employeesReady && !snapshot.employees.length && <div className="col-span-5"><Empty>No employees available.</Empty></div>}</div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between"><div><h2 className="text-sm font-black text-slate-950">Task Activity (7 days)</h2><p className="mt-2"><strong className="text-2xl font-black text-slate-950">{tasksReady ? data.completedToday.length : "—"}</strong><span className="ml-2 text-[10px] font-bold text-emerald-600">completed today</span></p></div><MapPin className="h-4 w-4 text-slate-400" /></div>
        <div className="mt-2 h-24"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.trend}><defs><linearGradient id="adminTaskTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={0.24} /><stop offset="100%" stopColor="#2563eb" stopOpacity={0} /></linearGradient></defs><XAxis dataKey="day" hide /><YAxis hide domain={[0, "dataMax + 1"]} /><Tooltip contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 11 }} /><Area type="monotone" dataKey="completed" stroke="#2563eb" strokeWidth={2.5} fill="url(#adminTaskTrend)" /></AreaChart></ResponsiveContainer></div>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between"><h2 className="text-sm font-black text-slate-950">Site Coverage (Today)</h2><span className="text-[10px] text-slate-400">Live</span></div>
        <div className="mt-4 flex items-center gap-5"><div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#22c55e ${taskCoverage * 3.6}deg, #f59e0b ${taskCoverage * 3.6}deg ${Math.min(360, taskCoverage * 3.6 + 34)}deg, #e5e7eb 0deg)` }}><span className="grid h-[68px] w-[68px] place-items-center rounded-full bg-white text-center"><span><strong className="block text-xl font-black text-slate-950">{tasksReady ? `${taskCoverage}%` : "—"}</strong><small className="text-[9px] text-slate-500">Covered</small></span></span></div><dl className="min-w-0 flex-1 space-y-2 text-[10px]"><div className="flex justify-between gap-2"><dt className="flex items-center gap-2 text-slate-500"><i className="h-2 w-2 rounded-full bg-emerald-500" />Completed</dt><dd className="font-black">{data.completedToday.length}</dd></div><div className="flex justify-between gap-2"><dt className="flex items-center gap-2 text-slate-500"><i className="h-2 w-2 rounded-full bg-orange-400" />In progress</dt><dd className="font-black">{data.siteTasks.length}</dd></div><div className="flex justify-between gap-2"><dt className="flex items-center gap-2 text-slate-500"><i className="h-2 w-2 rounded-full bg-slate-300" />Not started</dt><dd className="font-black">{data.activeTasks.filter(task => task.status === "Assigned").length}</dd></div></dl></div>
      </article>
    </section>
  </div>;
}
