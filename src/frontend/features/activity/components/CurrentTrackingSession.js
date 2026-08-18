"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Square } from "lucide-react";
import { useAccess } from "@/frontend/contexts/AccessContext";
import { apiJson } from "@/frontend/lib/apiClient";
import { formatDateTime, formatElapsed } from "@/frontend/features/activity/utils/formatters";
import ActivityEmptyState from "@/frontend/features/activity/components/ActivityEmptyState";
import { hasPermission } from "@/shared/permissions";

export default function CurrentTrackingSession({
  sessionInfo,
  devices,
  policy,
  busy,
  onStart,
  onStop
}) {
  const access = useAccess();
  const [deviceId, setDeviceId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [assignmentNotice, setAssignmentNotice] = useState("");
  const [now, setNow] = useState(Date.now());
  const activeDevices = useMemo(() => devices.filter(device => device.status === "active"), [devices]);
  const canViewProjects = hasPermission(access, "projects.view_self");
  const canViewTasks = hasPermission(access, "tasks.view_self");

  useEffect(() => {
    if (!deviceId && activeDevices[0]) setDeviceId(activeDevices[0].deviceId);
    if (deviceId && !activeDevices.some(device => device.deviceId === deviceId)) setDeviceId(activeDevices[0]?.deviceId || "");
  }, [activeDevices, deviceId]);

  useEffect(() => {
    if (!sessionInfo?.active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sessionInfo?.active]);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      canViewProjects ? apiJson("/api/projects", { cache: "no-store" }) : Promise.resolve({ data: [] }),
      canViewTasks ? apiJson("/api/tasks", { cache: "no-store" }) : Promise.resolve({ data: [] })
    ]).then(([projectResult, taskResult]) => {
      if (cancelled) return;
      if (projectResult.status === "fulfilled") {
        setProjects((projectResult.value.data || []).filter(project => !["Completed", "Cancelled"].includes(project.status)));
      }
      if (taskResult.status === "fulfilled") {
        setTasks((taskResult.value.data || []).filter(task => task.status !== "Completed"));
      }
      if (projectResult.status === "rejected" && taskResult.status === "rejected") {
        setAssignmentNotice("Assigned work could not be loaded. You can still start tracking without selecting a project or task.");
      } else {
        setAssignmentNotice("");
      }
    });
    return () => { cancelled = true; };
  }, [canViewProjects, canViewTasks]);

  const canStart = Boolean(
    policy?.trackingEnabled
    && (!policy.requireAcknowledgement || policy.acknowledgementStatus?.acknowledged)
    && deviceId
  );
  const activeProject = projects.find(project => project.id === sessionInfo?.session?.projectId);
  const activeTask = tasks.find(task => task.id === sessionInfo?.session?.taskId);

  if (sessionInfo?.active) {
    const session = sessionInfo.session;
    return <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Tracking active</p><h2 className="mt-1 text-xl font-bold">{formatElapsed(session.startedAt, now)}</h2><p className="mt-2 text-sm text-slate-500">Started {formatDateTime(session.startedAt)}</p></div>
        <button type="button" disabled={busy} onClick={onStop} className="btn-secondary border-rose-200 text-rose-700"><Square className="h-4 w-4" />{busy ? "Stopping…" : "Stop tracking"}</button>
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-slate-500">Device</dt><dd className="font-semibold">{sessionInfo.device?.deviceName || session.deviceId}</dd></div>
        <div><dt className="text-slate-500">Project</dt><dd className="font-semibold">{activeProject?.title || session.projectId || "None"}</dd></div>
        <div><dt className="text-slate-500">Task</dt><dd className="font-semibold">{activeTask?.title || session.taskId || "None"}</dd></div>
        <div><dt className="text-slate-500">Policy</dt><dd className="font-semibold">Version {sessionInfo.policy?.policyVersion || policy?.policyVersion || "—"}</dd></div>
      </dl>
    </section>;
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div><h2 className="font-bold">Current tracking session</h2><p className="mt-1 text-sm text-slate-500">Tracking starts only after you press the button below.</p></div>
    {!activeDevices.length
      ? <div className="mt-5"><ActivityEmptyState title="No active registered device" description="The desktop agent must register a device, and an authorised administrator must activate it, before tracking can start." /></div>
      : <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label><span className="label">Active device</span><select className="input" value={deviceId} onChange={event => setDeviceId(event.target.value)}>{activeDevices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.deviceName} · {device.platform}</option>)}</select></label>
        <label><span className="label">Project (optional)</span><select className="input" value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">No project</option>{projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
        <label><span className="label">Task (optional)</span><select className="input" value={taskId} onChange={event => setTaskId(event.target.value)}><option value="">No task</option>{tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
        <div className="flex items-end"><button type="button" disabled={!canStart || busy} onClick={() => onStart({ deviceId, projectId: projectId || null, taskId: taskId || null })} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"><Play className="h-4 w-4" />{busy ? "Starting…" : "Start tracking"}</button></div>
      </div>}
    {assignmentNotice && <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">{assignmentNotice}</p>}
    <p className="mt-4 text-xs text-slate-500">The browser cannot monitor system-wide activity. This button controls a session for an already registered desktop agent. Selecting assigned work is optional and does not affect automatic agent startup or recovery.</p>
  </section>;
}
