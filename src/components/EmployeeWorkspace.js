"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight, Clock3, LocateFixed, MapPin, Plus, Radio, ReceiptText, Send, WalletCards, X } from "lucide-react";
import { useEmployeeTracking } from "@/components/EmployeeTrackingContext";
import EmployeeAttendance from "@/components/EmployeeAttendance";
import { managerTasks } from "@/lib/managerData";
import { apiJson } from "@/lib/apiClient";
import EmployeeProjects from "@/components/EmployeeProjects";
import { useAccess } from "@/components/AccessContext";
import { hasAnyPermission, hasPermission, PERMISSIONS } from "@/lib/permissions";

function useIdentity() {
  const [identity, setIdentity] = useState({ employeeId: "employee-demo", employee: "Employee" });
  useEffect(() => setIdentity({ employeeId: localStorage.getItem("fieldflow-employee-id") || "employee-demo", employee: localStorage.getItem("fieldflow-name") || "Employee" }), []);
  return identity;
}

function Heading({ title, subtitle, action }) { return <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-extrabold sm:text-4xl">{title}</h1><p className="mt-2 text-slate-500">{subtitle}</p></div>{action}</div>; }
function Pill({ status }) { const style = status === "Approved" || status === "Completed" || status === "On time" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : status === "Rejected" || status === "Blocked" ? "bg-rose-50 text-rose-700 border-rose-200" : status === "Pending" || status === "Needs Update" || status === "Late" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"; return <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${style}`}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{status}</span>; }
function Modal({ title, onClose, children }) { return <div className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950/50 p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><h2 className="text-xl font-bold">{title}</h2><button onClick={onClose}><X /></button></div><div className="mt-5">{children}</div></section></div>; }

function Home() {
  const access = useAccess();
  const router = useRouter();
  const tracking = useEmployeeTracking();
  const window = { alert: async () => { try { const location=await tracking.getPosition(); await apiJson("/api/sos",{method:"POST",body:JSON.stringify({location,message:"Emergency assistance requested"})}); globalThis.alert("SOS sent to your manager and administrator with your GPS location."); } catch(error) { globalThis.alert(error.message); } } };
  const identity = useIdentity();
  const [openAttendance, setOpenAttendance] = useState(null);
  const [completed, setCompleted] = useState(0);
  const [taskItems,setTaskItems]=useState([]);
  const [greeting, setGreeting] = useState("Welcome back");
  const [loadVersion, setLoadVersion] = useState(0);
  const [serviceState, setServiceState] = useState({ attendance: "loading", reports: "loading", tasks: "loading" });
  const managerTasks=taskItems.map(item=>({...item,employeeId:"e-1"}));
  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");
  }, []);
  useEffect(() => {
    let active = true;
    const updateState = (service, status) => active && setServiceState(current => ({ ...current, [service]: status }));
    async function loadAttendance() {
      if (!hasPermission(access, PERMISSIONS.attendanceViewSelf)) { setOpenAttendance(null); updateState("attendance", "unavailable"); return; }
      updateState("attendance", "loading");
      try {
        const payload = await apiJson("/api/attendance", { cache: "no-store" });
        if (!Array.isArray(payload.data)) throw new Error("Attendance response is invalid.");
        if (active) setOpenAttendance(payload.data.find(item => !item.checkOut) || null);
        updateState("attendance", "ready");
      } catch { if (active) setOpenAttendance(null); updateState("attendance", "error"); }
    }
    async function loadReports() {
      if (!hasPermission(access, PERMISSIONS.reportsSubmit)) { setCompleted(0); updateState("reports", "unavailable"); return; }
      updateState("reports", "loading");
      try {
        const payload = await apiJson("/api/reports", { cache: "no-store" });
        if (!Array.isArray(payload.data)) throw new Error("Reports response is invalid.");
        if (active) setCompleted(payload.data.filter(item => item.status === "Approved").length);
        updateState("reports", "ready");
      } catch { if (active) setCompleted(0); updateState("reports", "error"); }
    }
    async function loadTasks() {
      if (!hasPermission(access, PERMISSIONS.tasksViewSelf)) { setTaskItems([]); updateState("tasks", "unavailable"); return; }
      updateState("tasks", "loading");
      try {
        const payload = await apiJson("/api/tasks", { cache: "no-store" });
        if (!Array.isArray(payload.data)) throw new Error("Tasks response is invalid.");
        if (active) setTaskItems(payload.data);
        updateState("tasks", "ready");
      } catch { if (active) setTaskItems([]); updateState("tasks", "error"); }
    }
    loadAttendance();
    loadReports();
    loadTasks();
    return () => { active = false; };
  }, [access, loadVersion]);
  const failedServices = Object.entries(serviceState).filter(([, status]) => status === "error").map(([service]) => service);
  const attendanceLabel = serviceState.attendance === "loading" ? "Checking" : serviceState.attendance === "error" ? "Unavailable" : serviceState.attendance === "unavailable" ? "Not available" : openAttendance ? "On Duty" : "Offline";
  const attendanceReady = serviceState.attendance === "ready";
  const actions = [
    ["attendance", "Check In", LocateFixed, "bg-blue-500", PERMISSIONS.attendanceViewSelf],
    ["reports", "Report", Send, "bg-emerald-500", PERMISSIONS.reportsSubmit],
    ["expenses", "Expense", WalletCards, "bg-violet-500", PERMISSIONS.expensesSubmit],
    ["sos", "SOS", AlertTriangle, "bg-rose-500", PERMISSIONS.sosCreate]
  ].filter(item => hasPermission(access, item[4]));
  return <div className="space-y-6">
    <header>
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">Workspace overview</p>
      <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-extrabold tracking-[-0.03em] text-slate-950 sm:text-[32px]">{greeting}, {identity.employee}</h1><div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${attendanceReady && openAttendance ? "border-emerald-200 bg-emerald-50 text-emerald-700" : serviceState.attendance === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-500"}`}><span className={`h-2 w-2 rounded-full ${attendanceReady && openAttendance ? "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" : serviceState.attendance === "error" ? "bg-rose-500" : serviceState.attendance === "loading" ? "animate-pulse bg-blue-400" : "bg-slate-400"}`} />{attendanceLabel}</div></div>
      <p className="mt-1.5 text-sm text-slate-500">Your workday, at a glance.</p>
    </header>

    {failedServices.length > 0 && <section role="alert" className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">Some dashboard information could not be loaded.</p><p className="mt-1 text-sm text-amber-800">Unavailable: {failedServices.map(service => service.charAt(0).toUpperCase() + service.slice(1)).join(", ")}. Your existing records are unchanged.</p></div><button onClick={() => setLoadVersion(version => version + 1)} className="shrink-0 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-amber-100 focus:outline-none focus:ring-4 focus:ring-amber-200">Retry</button></section>}

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.75fr)]">
      <section className="relative overflow-hidden rounded-[24px] bg-[#0b1220] p-6 text-white shadow-[0_20px_55px_rgba(15,23,42,0.18)] sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative flex h-full min-h-[270px] flex-col">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Today</p><h2 className="mt-2 text-2xl font-bold tracking-tight">{serviceState.attendance === "loading" ? "Checking attendance…" : serviceState.attendance === "error" ? "Attendance is unavailable" : openAttendance ? "Attendance is active" : "Ready for the day?"}</h2><p className="mt-1.5 max-w-lg text-sm leading-6 text-slate-400">{serviceState.attendance === "error" ? "Open Attendance for details or retry the dashboard request." : openAttendance ? "Your current shift is open and attendance is up to date." : "Check in to begin your workday and keep your attendance status current."}</p></div><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-blue-300"><Clock3 className="h-5 w-5" /></span></div>
          <div className="mt-5 grid grid-cols-3 divide-x divide-white/10 rounded-xl border border-white/10 bg-white/[0.04]">
            <div className="px-4 py-4 sm:px-5"><strong className="block text-2xl font-extrabold tracking-tight">{serviceState.tasks === "loading" ? "…" : serviceState.tasks === "ready" ? taskItems.length : "—"}</strong><span className="mt-1 block text-xs text-slate-400">Assigned</span></div>
            <div className="px-4 py-4 sm:px-5"><strong className="block text-2xl font-extrabold tracking-tight text-emerald-400">{serviceState.reports === "loading" ? "…" : serviceState.reports === "ready" ? completed : "—"}</strong><span className="mt-1 block text-xs text-slate-400">Approved</span></div>
            <div className="px-4 py-4 sm:px-5"><strong className="block text-2xl font-extrabold tracking-tight text-blue-400">{serviceState.attendance === "loading" ? "…" : attendanceReady && openAttendance ? "Live" : "—"}</strong><span className="mt-1 block text-xs text-slate-400">Tracking</span></div>
          </div>
          <button onClick={() => router.push("/employee/attendance")} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-500/30 sm:w-fit sm:min-w-48"><Clock3 className="h-4 w-4" />{attendanceReady ? openAttendance ? "View attendance" : "Check in to start" : "Open attendance"}</button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.055)]">
        <div className="border-b border-slate-100 px-5 py-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Shortcuts</p><h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">Quick actions</h2></div>
        <div className="grid grid-cols-2">
          {actions.map(([slug, label, Icon, color]) => <button key={slug} onClick={() => slug === "sos" ? window.alert("SOS noted. For an immediate emergency, call 112.") : router.push(`/employee/${slug}`)} className="group flex min-h-[104px] flex-col items-start justify-between border-b border-slate-100 p-4 text-left odd:border-r transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-inset focus:ring-blue-100">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white ${color}`}><Icon className="h-4 w-4" /></span><span className="flex w-full items-center justify-between gap-2 text-sm font-bold text-slate-800">{label}<ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" /></span>
          </button>)}
        </div>
      </section>
    </div>

    <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-end justify-between gap-4 border-b border-slate-100 px-6 py-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Schedule</p><h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">Today's tasks</h2></div><button onClick={() => router.push("/employee/tasks")} className="text-sm font-bold text-blue-600 transition hover:text-blue-800">View all</button></div>
      {serviceState.tasks === "loading" && <div aria-live="polite" className="grid gap-3 p-6 sm:grid-cols-2"><div className="h-24 animate-pulse rounded-2xl bg-slate-100" /><div className="h-24 animate-pulse rounded-2xl bg-slate-100" /><span className="sr-only">Loading tasks</span></div>}
      {serviceState.tasks === "error" && <div className="flex flex-col items-start gap-3 px-6 py-7 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-slate-900">Tasks could not be loaded.</p><p className="mt-1 text-sm text-slate-500">Your existing tasks have not been changed.</p></div><button onClick={() => setLoadVersion(version => version + 1)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50">Retry</button></div>}
      {serviceState.tasks === "unavailable" && <div className="px-6 py-7 text-sm text-slate-500">Tasks are not available for your current role.</div>}
      {serviceState.tasks === "ready" && managerTasks.length === 0 && <div className="px-6 py-7"><p className="font-bold text-slate-900">No tasks assigned.</p><p className="mt-1 text-sm text-slate-500">New assigned work will appear here.</p></div>}
      {serviceState.tasks === "ready" && managerTasks.length > 0 && <div className="divide-y divide-slate-100">{managerTasks.filter(task => task.employeeId === "e-1").slice(0, 2).map((task, index) => <button onClick={() => router.push("/employee/tasks")} key={task.id} className="group flex w-full items-center gap-4 px-6 py-4 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-inset focus:ring-blue-100">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700"><ReceiptText className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase tracking-widest text-slate-400">Task {String(index + 1).padStart(2, "0")}</span><Pill status={task.status} /></div><h3 className="mt-2 truncate font-bold text-slate-950">{task.title}</h3><p className="mt-1 truncate text-sm text-slate-500">{task.client} · {task.address}</p></div><ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
      </button>)}</div>}
    </section>
  </div>;
}

function LegacyAttendance() {
  const identity = useIdentity();
  const tracking = useEmployeeTracking();
  const [records, setRecords] = useState([]);
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(() => fetch(`/api/attendance?employeeId=${encodeURIComponent(identity.employeeId)}`, { cache: "no-store" }).then(response => response.json()).then(payload => setRecords(payload.data)), [identity.employeeId]);
  useEffect(() => { load(); const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, [load]);
  const open = records.find(item => !item.checkOut);
  async function attendanceAction(action) { setBusy(true); setMessage(""); try { const location = action === "check-in" ? await tracking.startTracking() : await tracking.getPosition(); const response = await fetch("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...identity, action, location }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); if (action === "check-out") await tracking.stopTracking(); setMessage(action === "check-in" ? "Checked in. Live location sharing is active." : "Checked out. Live location sharing stopped."); await load(); } catch (error) { setMessage(error.message); } finally { setBusy(false); } }
  return <><Heading title="Attendance" subtitle="GPS-verified check-in, check-out and history." /><section className="card p-6"><div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-full bg-blue-50 text-blue-600"><Clock3 /></span><div><p className="text-xs uppercase tracking-widest text-slate-500">Current time</p><strong className="text-3xl">{now.toLocaleTimeString()}</strong></div></div>{open && <div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Check-in</p><strong>{open.checkIn}</strong></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">GPS location</p><strong>{open.checkInLocation ? `${Number(open.checkInLocation.latitude).toFixed(5)}, ${Number(open.checkInLocation.longitude).toFixed(5)}` : "Recorded"}</strong></div></div>}<button disabled={busy} onClick={() => attendanceAction(open ? "check-out" : "check-in")} className={`mt-5 w-full rounded-2xl px-5 py-4 font-bold text-white disabled:opacity-50 ${open ? "bg-rose-500" : "bg-blue-600"}`}>{busy ? "Getting GPS location…" : open ? "Check out" : "Check in with GPS"}</button><p className="mt-3 text-center text-sm text-slate-500">Your real device location verifies attendance. Live sharing automatically runs between check-in and check-out.</p>{message && <p className={`mt-3 rounded-xl p-3 text-sm ${message.includes("stopped") || message.includes("active") ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{message}</p>}</section><section className="card mt-6 p-6"><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-widest text-slate-500">Live location</p><strong>{tracking.status === "sharing" ? "Sharing with manager and admin" : tracking.status === "requesting" ? "Requesting GPS…" : "Not sharing"}</strong></div><span className={`grid h-12 w-12 place-items-center rounded-full ${tracking.status === "sharing" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}><Radio /></span></div>{tracking.latest && <p className="mt-3 text-xs text-slate-500">Accuracy {Math.round(tracking.latest.accuracy)} metres · updates every 10 seconds</p>}</section><h2 className="mt-8 text-sm font-bold uppercase tracking-widest text-slate-500">History</h2><div className="mt-3 space-y-3">{records.filter(item => item.checkOut).map(item => <div key={item.id} className="card flex items-center justify-between p-5"><div><strong>{item.date}</strong><p className="text-sm text-slate-500">In {item.checkIn} · Out {item.checkOut}</p></div><div className="text-right"><strong>{item.hours}</strong><div className="mt-1"><Pill status={item.status} /></div></div></div>)}</div></>;
}

function Reports() {
  const identity = useIdentity();

  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [taskItems, setTaskItems] = useState([]);

  const load = useCallback(
    () =>
      apiJson("/api/reports", { cache: "no-store" }).then(payload =>
        setItems(payload.data)
      ),
    [identity.employeeId]
  );

  useEffect(() => {
    load();

    apiJson("/api/tasks", { cache: "no-store" }).then(payload =>
      setTaskItems(payload.data)
    );
  }, [load]);

  async function submit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    const selectedTask = taskItems.find(
      task => task.id === data.taskId
    );

    const reportData = {
      ...data,
      task: selectedTask?.title || "General daily work",
      taskId: selectedTask?.id || null
    };

    try {
      await apiJson("/api/reports", {
        method: "POST",
        body: JSON.stringify(reportData)
      });

      setMessage("Report submitted to your manager.");
      form.reset();
      load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <>
      <Heading
        title="Daily reports"
        subtitle="Summarise the day, flag blockers, and plan tomorrow."
      />

      <form onSubmit={submit} className="card space-y-5 p-6">
        <label>
          <span className="label uppercase tracking-widest">
            Task
          </span>

          <select name="taskId" className="input">
            <option value="">
              General daily work — no assigned task
            </option>

            {taskItems.map(task => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
          <label>
            <span className="label uppercase tracking-widest">
              Work completed
            </span>

            <textarea
              name="workCompleted"
              required
              className="input min-h-28"
              placeholder="What did you accomplish today?"
            />
          </label>

          <label>
            <span className="label uppercase tracking-widest">
              Hours
            </span>

            <input
              name="hours"
              required
              type="number"
              min="0.5"
              max="24"
              step="0.5"
              className="input"
              placeholder="8"
            />
          </label>
        </div>

        <label>
          <span className="label uppercase tracking-widest">
            Problems / delays
          </span>

          <input
            name="problems"
            className="input"
            placeholder="Optional"
          />
        </label>

        <label>
          <span className="label uppercase tracking-widest">
            Tomorrow's plan
          </span>

          <input
            name="tomorrowPlan"
            className="input"
            placeholder="Optional"
          />
        </label>

        <button className="btn-primary w-full rounded-full py-4">
          <Send className="h-4 w-4" />
          Submit report
        </button>

        {message && (
          <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-700">
            {message}
          </p>
        )}
      </form>

      <h2 className="mt-8 text-sm font-bold uppercase tracking-widest text-slate-500">
        Recent reports
      </h2>

      <div className="mt-3 space-y-3">
        {items.map(item => (
          <article key={item.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">{item.workCompleted}</h3>

                <p className="mt-1 text-sm text-slate-500">
                  {item.date} · {item.hours}h · {item.task}
                </p>
              </div>

              <Pill status={item.status} />
            </div>

            {item.managerComment && (
              <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
                <strong>Manager:</strong> {item.managerComment}
              </p>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

function Expenses() {
  const identity = useIdentity();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => apiJson("/api/expenses", { cache: "no-store" }).then(payload => setItems(payload.data)), [identity.employeeId]);
  useEffect(() => { load(); }, [load]);
  async function submit(event) { event.preventDefault(); try { await apiJson("/api/expenses", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); setOpen(false); load(); } catch(error) { window.alert(error.message); } }
  const pending = items.filter(item => item.status === "Pending").reduce((sum, item) => sum + item.amount, 0); const approved = items.filter(item => item.status === "Approved").reduce((sum, item) => sum + item.amount, 0);
  return <><Heading title="Expenses" subtitle="Log field costs and track approvals." action={<button onClick={() => setOpen(true)} className="btn-primary rounded-full px-7 py-4"><Plus />New</button>} /><div className="grid gap-4 sm:grid-cols-2"><div className="card p-6"><p className="text-xs uppercase tracking-widest text-slate-500">Pending</p><strong className="mt-2 block text-3xl text-amber-600">₹{pending.toLocaleString("en-IN")}</strong></div><div className="card p-6"><p className="text-xs uppercase tracking-widest text-slate-500">Approved</p><strong className="mt-2 block text-3xl text-emerald-600">₹{approved.toLocaleString("en-IN")}</strong></div></div><div className="mt-5 space-y-3">{items.map(item => <div className="card flex items-center justify-between gap-4 p-5" key={item.id}><div><strong>₹{item.amount.toLocaleString("en-IN")} · {item.type}</strong><p className="mt-1 text-sm text-slate-500">{item.date} · {item.note}</p>{item.managerComment && <p className="mt-2 text-xs text-blue-700">Manager: {item.managerComment}</p>}</div><Pill status={item.status} /></div>)}</div>{open && <Modal title="New expense" onClose={() => setOpen(false)}><form onSubmit={submit} className="space-y-4"><label><span className="label">Type</span><select name="type" className="input"><option>Travel</option><option>Meals</option><option>Fuel</option><option>Materials</option><option>Tools</option></select></label><label><span className="label">Amount</span><input name="amount" type="number" min="1" required className="input" /></label><label><span className="label">Description</span><textarea name="note" required className="input min-h-24" /></label><button className="btn-primary w-full">Submit expense</button></form></Modal>}</>;
}

function Tasks() {
  const [selected,setSelected]=useState(null); const [tasks,setTasks]=useState([]);
  useEffect(()=>{apiJson("/api/tasks",{cache:"no-store"}).then(payload=>setTasks(payload.data));},[]);
  async function update(id,status){const payload=await apiJson("/api/tasks",{method:"PATCH",body:JSON.stringify({id,status})});setTasks(current=>current.map(item=>item.id===id?payload.data:item));setSelected(payload.data);}
  return <><Heading title="My tasks" subtitle="Today's assigned field work."/><div className="space-y-3">{tasks.map(task=><button onClick={()=>setSelected(task)} key={task.id} className="card flex w-full items-center gap-4 p-5 text-left"><span className="grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-600"><MapPin/></span><div><h2 className="font-bold">{task.title}</h2><p className="text-sm text-slate-500">{task.client} · {task.address}</p><div className="mt-2"><Pill status={task.status}/></div></div><ChevronRight className="ml-auto"/></button>)}</div>{selected&&<Modal title={selected.title} onClose={()=>setSelected(null)}><p className="text-slate-500">{selected.client}</p><p className="mt-3 flex items-center gap-2"><MapPin className="h-4 w-4"/>{selected.address}</p><div className="mt-4"><Pill status={selected.status}/></div><div className="mt-5 flex flex-wrap gap-2">{["On The Way","In Progress","Completed","Blocked"].map(status=><button key={status} onClick={()=>update(selected.id,status)} className="btn-secondary text-sm">{status}</button>)}</div><a className="btn-primary mt-6 w-full" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(selected.address)}`}>Open directions</a></Modal>}</>;
}

function Profile() { const identity = useIdentity(); const router = useRouter(); return <><Heading title="My profile" subtitle="Your FieldFlow employee account." /><section className="card p-7 text-center"><div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-blue-100 text-3xl font-bold text-blue-700">{identity.employee.charAt(0)}</div><h2 className="mt-4 text-2xl font-bold">{identity.employee}</h2><p className="text-slate-500">{typeof window !== "undefined" ? localStorage.getItem("fieldflow-user") : ""}</p><button onClick={() => router.push("/employee/expenses")} className="btn-secondary mt-6">View expenses</button></section></>;
}

function EmployeeWork({ access }) {
  return <div className="space-y-10">
    {hasPermission(access, PERMISSIONS.projectsViewSelf) && <EmployeeProjects />}
    {hasPermission(access, PERMISSIONS.tasksViewSelf) && <Tasks />}
  </div>;
}

export default function EmployeeWorkspace({ section }) {
  const access = useAccess();
  const content = useMemo(() => {
    if (!access) return null;
    if (!section) {
      if (hasPermission(access, PERMISSIONS.dashboardView)) return <Home />;
      if (hasAnyPermission(access, [PERMISSIONS.projectsViewSelf, PERMISSIONS.tasksViewSelf])) return <EmployeeWork access={access} />;
      if (hasPermission(access, PERMISSIONS.attendanceViewSelf)) return <EmployeeAttendance />;
      return <Profile />;
    }
    if (section === "tasks" && hasAnyPermission(access, [PERMISSIONS.projectsViewSelf, PERMISSIONS.tasksViewSelf])) return <EmployeeWork access={access} />;
    if (section === "attendance" && hasPermission(access, PERMISSIONS.attendanceViewSelf)) return <EmployeeAttendance />;
    if (section === "reports" && hasPermission(access, PERMISSIONS.reportsSubmit)) return <Reports />;
    if (section === "expenses" && hasPermission(access, PERMISSIONS.expensesSubmit)) return <Expenses />;
    if (section === "profile") return <Profile />;
    return <section className="card p-10 text-center"><h1 className="text-xl font-bold">Module not available</h1><p className="mt-2 text-slate-500">Your assigned role does not include permission for this module.</p></section>;
  }, [access, section]);
  return content;
}
