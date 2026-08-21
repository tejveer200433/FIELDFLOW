"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coffee,
  FileText,
  ListChecks,
  MapPin,
  Navigation,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  TimerReset,
  WalletCards
} from "lucide-react";
import { useAccess } from "@/frontend/contexts/AccessContext";
import { useEmployeeTracking } from "@/frontend/features/activity/context/EmployeeTrackingContext";
import { apiJson } from "@/frontend/lib/apiClient";
import { hasPermission, PERMISSIONS } from "@/shared/permissions";
import { breakDurationSeconds, dashboardTaskStats, localDateKey, sameLocalDay, workedDurationSeconds } from "@/shared/employeeDashboard";
import { durationSeconds, formatDuration } from "@/shared/time";

const PRIORITY_ORDER = { High: 0, Urgent: 0, Medium: 1, Low: 2 };

function fullTimer(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map(value => String(value).padStart(2, "0"))
    .join(":");
}

function taskTone(task) {
  if (task.status === "Completed") return { label: "Completed", className: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" };
  if (task.status === "Blocked") return { label: "Needs attention", className: "bg-rose-50 text-rose-700", dot: "bg-rose-500" };
  if (task.scheduledAt && new Date(task.scheduledAt) < new Date() && !sameLocalDay(task.scheduledAt)) return { label: "Overdue", className: "bg-rose-50 text-rose-700", dot: "bg-rose-500" };
  if (task.priority === "High" || task.priority === "Urgent") return { label: "High priority", className: "bg-amber-50 text-amber-700", dot: "bg-amber-500" };
  if (sameLocalDay(task.scheduledAt)) return { label: "Due today", className: "bg-blue-50 text-blue-700", dot: "bg-blue-500" };
  return { label: task.status || "Assigned", className: "bg-slate-100 text-slate-600", dot: "bg-slate-400" };
}

function DashboardSkeleton() {
  return <div aria-label="Loading your workday" aria-live="polite" className="space-y-5">
    <div className="h-20 animate-pulse rounded-3xl bg-white" />
    <div className="grid gap-4 xl:grid-cols-3"><div className="h-72 animate-pulse rounded-2xl bg-violet-200" /><div className="h-72 animate-pulse rounded-2xl bg-white" /><div className="h-72 animate-pulse rounded-2xl bg-white" /></div>
    <div className="grid gap-4 xl:grid-cols-3"><div className="h-72 animate-pulse rounded-2xl bg-white" /><div className="h-72 animate-pulse rounded-2xl bg-white" /><div className="h-72 animate-pulse rounded-2xl bg-white" /></div>
    <span className="sr-only">Loading your workday information</span>
  </div>;
}

function SectionHeader({ eyebrow, title, action }) {
  return <div className="flex items-end justify-between gap-4">
    <div>{eyebrow && <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</p>}<h2 className={`${eyebrow ? "mt-1" : ""} text-base font-extrabold tracking-[-0.02em] text-slate-950`}>{title}</h2></div>
    {action}
  </div>;
}

export default function EmployeeDashboard() {
  const access = useAccess();
  const router = useRouter();
  const tracking = useEmployeeTracking();
  const [now, setNow] = useState(Date.now());
  const [data, setData] = useState({ attendance: [], breaks: [], plan: null, tasks: [], reportSummary: { totalReports: 0, approved: 0 } });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [sosBusy, setSosBusy] = useState(false);
  const hasLoaded = useRef(false);

  const can = useCallback(permission => hasPermission(access, permission), [access]);

  const load = useCallback(async () => {
    if (hasLoaded.current) setRefreshing(true);
    setError("");
    try {
      const payload = await apiJson(`/api/employee-dashboard?day=${localDateKey()}`, { cache: "no-store" });
      setData(current => ({
        attendance: payload.data.attendance ?? current.attendance,
        breaks: payload.data.breaks ?? current.breaks,
        plan: payload.data.plan ?? current.plan,
        tasks: payload.data.tasks ?? current.tasks,
        reportSummary: payload.data.reportSummary ?? current.reportSummary
      }));
      if (payload.errors?.length) {
        const labels = { attendance: "Attendance", tasks: "Tasks", reports: "Reports" };
        setError(`${payload.errors.map(item => labels[item] || item).join(", ")} could not be refreshed. Other dashboard information is up to date.`);
      }
    } catch (requestError) {
      setError(requestError.message || "Your dashboard could not be refreshed. Please try again.");
    } finally {
      hasLoaded.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const employeeName = access?.profile?.full_name || "FieldFlow user";
  const openAttendance = data.attendance.find(item => !item.checkOutAt && !item.checkOut) || null;
  const activeBreak = data.breaks.find(item => !item.endedAt) || null;
  const todayRecords = data.attendance.filter(item => sameLocalDay(item.checkInAt || item.date));
  const workedSeconds = todayRecords.reduce((total, record) => total + workedDurationSeconds(record, data.breaks, now), 0);
  const grossSeconds = todayRecords.reduce((total, record) => total + durationSeconds(record, now), 0);
  const unpaidBreakSeconds = todayRecords.reduce((total, record) => total + breakDurationSeconds(record, data.breaks, now, "unpaid"), 0);
  const breakAllowanceSeconds = (data.plan?.unpaidBreakMinutes || 0) * 60;
  const taskStats = dashboardTaskStats(data.tasks, new Date(now));
  const completedTasks = taskStats.completedToday;
  const taskCompletion = taskStats.completion;
  const progressValue = taskCompletion ?? 0;
  const progressFirstStop = progressValue * 0.34;
  const progressSecondStop = progressValue * 0.67;
  const approvedReports = data.reportSummary.approved;
  const reportApproval = data.reportSummary.totalReports ? Math.round((approvedReports / data.reportSummary.totalReports) * 100) : null;

  const focusTasks = useMemo(() => data.tasks.filter(task => task.status !== "Completed").sort((left, right) => {
    const leftOverdue = left.scheduledAt && new Date(left.scheduledAt) < new Date() && !sameLocalDay(left.scheduledAt) ? 0 : 1;
    const rightOverdue = right.scheduledAt && new Date(right.scheduledAt) < new Date() && !sameLocalDay(right.scheduledAt) ? 0 : 1;
    if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue;
    const priority = (PRIORITY_ORDER[left.priority] ?? 3) - (PRIORITY_ORDER[right.priority] ?? 3);
    if (priority) return priority;
    return new Date(left.scheduledAt || left.updatedAt || 0) - new Date(right.scheduledAt || right.updatedAt || 0);
  }).slice(0, 4), [data.tasks]);

  const timeline = (() => {
    const events = [];
    todayRecords.forEach(record => {
      if (record.checkInAt) events.push({ id: `in-${record.id}`, time: new Date(record.checkInAt), title: "Checked in", detail: record.shiftName || record.checkInLocation?.geofenceName || "Workday started", current: !record.checkOutAt && !record.checkOut });
      if (record.checkOutAt) events.push({ id: `out-${record.id}`, time: new Date(record.checkOutAt), title: "Checked out", detail: `Worked ${formatDuration(workedDurationSeconds(record, data.breaks))}` });
    });
    data.tasks.filter(task => sameLocalDay(task.scheduledAt)).forEach(task => events.push({ id: `task-${task.id}`, time: new Date(task.scheduledAt), title: task.title, detail: task.status, current: task.status === "In Progress" }));
    return events.sort((left, right) => left.time - right.time);
  })();

  const fieldTask = data.tasks.find(task => task.status === "On The Way" && task.address);
  const greetingHour = new Date(now).getHours();
  const greeting = greetingHour < 12 ? "Good morning" : greetingHour < 17 ? "Good afternoon" : "Good evening";
  const contextualMessage = openAttendance
    ? activeBreak ? "Take the pause you need—your workday is safely recorded." : taskStats.active.length ? `You have ${taskStats.active.length} active work item${taskStats.active.length === 1 ? "" : "s"} to focus on.` : "All assigned work is complete."
    : "Start when you are ready and keep your day organised in one place.";
  const shiftEnded = Boolean(openAttendance?.scheduledEndAt && now > new Date(openAttendance.scheduledEndAt).getTime());
  const workStatus = activeBreak
    ? "On break"
    : openAttendance
      ? shiftEnded ? "Overtime" : openAttendance.status === "Late" ? "Late" : "Working"
      : data.plan?.weeklyOff ? "Weekly off" : data.plan ? "Not checked in" : "No shift assigned";
  const scheduleLabel = data.plan ? `${data.plan.startTime}–${data.plan.endTime}` : "No assigned schedule";

  const quickActions = [
    { label: "My work", description: "Tasks and projects", icon: ListChecks, route: "/employee/tasks", permissions: [PERMISSIONS.projectsViewSelf, PERMISSIONS.tasksViewSelf] },
    { label: "Attendance", description: openAttendance ? "Manage current shift" : "Start your workday", icon: Clock3, route: "/employee/attendance", permissions: [PERMISSIONS.attendanceViewSelf] },
    { label: "Daily report", description: "Share your progress", icon: Send, route: "/employee/reports", permissions: [PERMISSIONS.reportsSubmit] },
    { label: "Add expense", description: "Submit a work cost", icon: WalletCards, route: "/employee/expenses", permissions: [PERMISSIONS.expensesSubmit] },
    { label: "My activity", description: "Review work sessions", icon: Activity, route: "/employee/activity", permissions: ["activity.view_self"] }
  ].filter(action => action.permissions.some(can));

  async function sendSos() {
    if (!can(PERMISSIONS.sosCreate) || sosBusy) return;
    setSosBusy(true);
    try {
      const location = await tracking.getPosition();
      await apiJson("/api/sos", { method: "POST", body: JSON.stringify({ location, message: "Emergency assistance requested" }) });
      globalThis.alert("SOS sent to your manager and administrator with your current GPS location.");
    } catch (requestError) {
      globalThis.alert(requestError.message);
    } finally {
      setSosBusy(false);
    }
  }

  if (loading) return <DashboardSkeleton />;

  return <div className="space-y-4 pb-4">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-[-0.04em] text-slate-950 sm:text-[30px]">{greeting}, {employeeName} <span aria-hidden="true">👋</span></h1>
        <p className="mt-1 text-xs font-medium text-slate-500">{new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(now))}</p>
        <p className="mt-1 text-xs text-slate-400">{contextualMessage}</p>
      </div>
      <button disabled={refreshing} onClick={load} className="btn-secondary w-fit disabled:opacity-60" aria-label="Refresh workday"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Refreshing" : "Refresh"}</button>
    </header>

    {error && <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-center gap-2"><AlertCircle className="h-5 w-5 shrink-0" />{error}</span><button onClick={load} className="font-bold text-amber-950 underline underline-offset-4">Try again</button></div>}

    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <section className="relative min-h-[270px] overflow-hidden rounded-2xl bg-gradient-to-br from-[#7657f8] via-[#5457ed] to-[#2674ed] p-5 text-white shadow-[0_18px_40px_rgba(79,70,229,0.24)] sm:p-6">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
        <div className="relative flex h-full flex-col">
          <div className="flex items-start justify-between gap-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider"><span className={`h-2 w-2 rounded-full ${activeBreak || workStatus === "Late" || workStatus === "Overtime" ? "bg-amber-300" : openAttendance ? "bg-emerald-300" : "bg-slate-300"}`} />{workStatus}</span>
            <TimerReset className="h-5 w-5 text-white/70" />
          </div>
          <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/65">Net worked today</p>
          <p className="mt-1 font-mono text-4xl font-semibold tracking-[-0.05em] sm:text-5xl" aria-label={`${formatDuration(workedSeconds)} net work today`}>{fullTimer(workedSeconds)}</p>
          <p className="mt-2 text-xs text-white/75">{openAttendance ? `Started ${new Date(openAttendance.checkInAt || `${openAttendance.date}T${openAttendance.checkIn}`).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${openAttendance.shiftName ? ` · ${openAttendance.shiftName}` : ""}` : "Your timer begins after a verified attendance check-in."}</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-[10px]"><div className="rounded-lg bg-white/10 p-2"><span className="block text-white/60">Assigned shift</span><strong className="mt-0.5 block truncate">{scheduleLabel}</strong></div><div className="rounded-lg bg-white/10 p-2"><span className="block text-white/60">Gross elapsed</span><strong className="mt-0.5 block">{formatDuration(grossSeconds)}</strong></div><div className="rounded-lg bg-white/10 p-2"><span className="block text-white/60">Unpaid break</span><strong className="mt-0.5 block">{formatDuration(unpaidBreakSeconds)}{breakAllowanceSeconds ? ` / ${formatDuration(breakAllowanceSeconds)}` : ""}</strong></div></div>
          {unpaidBreakSeconds > breakAllowanceSeconds && breakAllowanceSeconds > 0 && <p className="mt-2 text-[10px] font-bold text-amber-200">Break allowance exceeded by {formatDuration(unpaidBreakSeconds - breakAllowanceSeconds)}.</p>}
          <div className="mt-auto grid grid-cols-2 gap-2 pt-6">
            {openAttendance && <button onClick={() => router.push("/employee/attendance")} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/35 bg-white/10 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-white/20 focus:outline-none focus:ring-4 focus:ring-white/10"><Coffee className="h-4 w-4" />{activeBreak ? "Resume work" : "Take break"}</button>}
            <button onClick={() => router.push("/employee/attendance")} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 focus:outline-none focus:ring-4 focus:ring-white/30 ${openAttendance ? "" : "col-span-2"}`}><Clock3 className="h-4 w-4" />{openAttendance ? "Finish work" : "Start work"}</button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
        <SectionHeader eyebrow="" title="Today’s Progress" />
        <div className="mt-5 flex items-center gap-5">
          <div className="relative grid h-32 w-32 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#22c55e 0 ${progressFirstStop}%, #f59e0b ${progressFirstStop}% ${progressSecondStop}%, #6d4aff ${progressSecondStop}% ${progressValue}%, #edf0f5 ${progressValue}% 100%)` }}>
            <div className="grid h-[100px] w-[100px] place-items-center rounded-full bg-white text-center"><div><strong className="block text-3xl font-extrabold text-slate-950">{taskCompletion == null ? "—" : `${taskCompletion}%`}</strong><span className="text-[10px] font-semibold text-slate-400">of today&apos;s tasks</span></div></div>
          </div>
          <dl className="min-w-0 flex-1 space-y-4 text-xs"><div><dt className="text-slate-400">Time worked</dt><dd className="mt-0.5 font-extrabold text-slate-900">{formatDuration(workedSeconds)}</dd></div><div><dt className="text-slate-400">Tasks completed today</dt><dd className="mt-0.5 font-extrabold text-slate-900">{completedTasks.length} / {taskStats.today.length}</dd></div><div><dt className="text-slate-400">Reports approved today</dt><dd className="mt-0.5 font-extrabold text-slate-900">{approvedReports}</dd></div></dl>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)] lg:col-span-2 xl:col-span-1">
        <SectionHeader eyebrow="" title="Quick Actions" />
        <div className="mt-5 grid grid-cols-3 gap-x-3 gap-y-5">
          {quickActions.slice(0, 6).map(({ label, icon: Icon, route }, index) => <button key={route} onClick={() => router.push(route)} className="group flex min-w-0 flex-col items-center gap-2 text-center focus:outline-none focus:ring-4 focus:ring-blue-100"><span className={`grid h-12 w-12 place-items-center rounded-xl transition group-hover:-translate-y-0.5 ${["bg-emerald-50 text-emerald-600", "bg-blue-50 text-blue-600", "bg-amber-50 text-amber-600", "bg-violet-50 text-violet-600", "bg-cyan-50 text-cyan-600"][index % 5]}`}><Icon className="h-5 w-5" /></span><strong className="truncate text-[10px] text-slate-800">{label}</strong></button>)}
          {can(PERMISSIONS.sosCreate) && <button disabled={sosBusy} onClick={sendSos} className="group flex min-w-0 flex-col items-center gap-2 text-center focus:outline-none focus:ring-4 focus:ring-rose-100 disabled:opacity-50"><span className="grid h-12 w-12 place-items-center rounded-xl bg-rose-50 text-rose-600 transition group-hover:-translate-y-0.5"><AlertCircle className="h-5 w-5" /></span><strong className="truncate text-[10px] text-slate-800">{sosBusy ? "Sending…" : "SOS"}</strong></button>}
        </div>
      </section>
      </div>

    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
        <SectionHeader eyebrow="" title="Today’s Focus" action={can(PERMISSIONS.tasksViewSelf) && <button onClick={() => router.push("/employee/tasks")} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:text-blue-700">View all</button>} />
        <div className="mt-5 divide-y divide-slate-100">
          {focusTasks.map(task => {
            const tone = taskTone(task);
            return <button key={task.id} onClick={() => router.push("/employee/tasks")} className="group flex w-full items-center gap-4 py-4 text-left first:pt-0 last:pb-0 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-950">{task.title}</strong><span className="mt-1 block truncate text-xs text-slate-500">{task.client || task.description || "Assigned work"}{task.scheduledAt ? ` · ${new Date(task.scheduledAt).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</span></span>
              <span className={`hidden rounded-full px-2.5 py-1 text-[11px] font-bold sm:inline-flex ${tone.className}`}>{tone.label}</span><ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
            </button>;
          })}
          {!focusTasks.length && <div className="py-10 text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-emerald-500" /><p className="mt-3 font-bold text-slate-900">No tasks need your attention</p><p className="mt-1 text-sm text-slate-500">New assigned work will appear here.</p></div>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
        <SectionHeader eyebrow="" title="Your Day" />
        <ol className="relative mt-5 space-y-4 before:absolute before:bottom-2 before:left-[67px] before:top-2 before:w-px before:bg-slate-200">
          {timeline.map(event => <li key={event.id} className="relative grid grid-cols-[52px_18px_1fr] gap-2"><time className="pt-0.5 text-xs font-bold text-slate-500">{event.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><span className={`relative z-10 mt-1 h-3 w-3 rounded-full border-[3px] border-white ring-2 ${event.current ? "bg-blue-600 ring-blue-200" : "bg-slate-400 ring-slate-100"}`} /><div><strong className="block text-sm text-slate-900">{event.title}</strong><span className="mt-0.5 block text-xs text-slate-500">{event.detail}</span></div></li>)}
          {!timeline.length && <li className="rounded-2xl bg-slate-50 p-5 text-center"><CalendarDays className="mx-auto h-7 w-7 text-slate-400" /><p className="mt-2 font-bold text-slate-800">Your timeline is clear</p><p className="mt-1 text-xs text-slate-500">Today’s attendance and scheduled tasks will appear here.</p></li>}
        </ol>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)] lg:col-span-2 xl:col-span-1">
        <SectionHeader eyebrow="" title="Your Performance" />
        <div className="mt-4 text-center"><div className="mx-auto grid h-28 w-28 place-items-center rounded-full border-[9px] border-emerald-400 border-b-slate-100"><div><strong className="block text-3xl font-extrabold text-slate-950">{taskCompletion == null ? "—" : `${taskCompletion}%`}</strong><span className="text-[10px] font-bold text-emerald-600">{taskCompletion == null ? "No tasks today" : taskCompletion >= 80 ? "Excellent" : "In progress"}</span></div></div></div>
        <dl className="mt-5 space-y-4 text-xs">
          <div className="grid grid-cols-[110px_1fr_38px] items-center gap-2"><dt className="flex items-center gap-2 text-slate-600"><Clock3 className="h-4 w-4 text-blue-500" />Time today</dt><dd className="h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${Math.min(100, Math.round(workedSeconds / 288))}%` }} /></dd><span className="text-right font-bold text-slate-800">{formatDuration(workedSeconds)}</span></div>
          <div className="grid grid-cols-[110px_1fr_38px] items-center gap-2"><dt className="flex items-center gap-2 text-slate-600"><Target className="h-4 w-4 text-emerald-500" />Tasks</dt><dd className="h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${taskCompletion ?? 0}%` }} /></dd><span className="text-right font-bold text-slate-800">{taskCompletion == null ? "—" : `${taskCompletion}%`}</span></div>
          <div className="grid grid-cols-[110px_1fr_38px] items-center gap-2"><dt className="flex items-center gap-2 text-slate-600"><FileText className="h-4 w-4 text-violet-500" />Reports</dt><dd className="h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-violet-500" style={{ width: `${reportApproval ?? 0}%` }} /></dd><span className="text-right font-bold text-slate-800">{reportApproval == null ? "—" : `${reportApproval}%`}</span></div>
        </dl>
      </section>
    </div>

    {fieldTask && <section className="overflow-hidden rounded-[24px] border border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white"><Navigation className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-blue-600">Current field task</p><h2 className="mt-1 truncate text-xl font-extrabold text-slate-950">{fieldTask.title}</h2><p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="h-4 w-4" />{fieldTask.address}</p></div><a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(fieldTask.address)}`} target="_blank" rel="noreferrer" className="btn-primary shrink-0"><Navigation className="h-4 w-4" />Navigate</a></div></section>}

    <section id="fieldflow-ai" className="relative overflow-hidden rounded-2xl border-2 border-violet-500 bg-white p-5 shadow-[0_12px_30px_rgba(109,74,255,0.1)]">
      <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-violet-300/30 blur-3xl" />
      <div className="relative grid gap-5 lg:grid-cols-[1fr_1fr_auto] lg:items-center">
        <div><p className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><Sparkles className="h-4 w-4 text-violet-600" />FieldFlow AI Assistant <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] text-violet-700">BETA</span></p><p className="mt-3 max-w-xl text-xs leading-5 text-slate-600">AI assistance is not connected yet. Your real workday information remains available through these safe shortcuts.</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={() => router.push("/employee/tasks")} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-600 hover:border-violet-400">What should I work on next?</button>{can(PERMISSIONS.attendanceViewSelf) && <button onClick={() => router.push("/employee/attendance")} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-600 hover:border-violet-400">Review today’s time</button>}</div>
        <button disabled className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-bold text-white opacity-55" title="AI functionality is not connected yet"><Sparkles className="h-4 w-4" />Plan My Day</button>
      </div>
    </section>
  </div>;
}
