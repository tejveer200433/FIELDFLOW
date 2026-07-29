"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Square } from "lucide-react";
import { formatDateTime, formatElapsed } from "@/lib/activity/formatters";
import ActivityEmptyState from "@/components/activity/ActivityEmptyState";

export default function CurrentTrackingSession({
  sessionInfo,
  devices,
  policy,
  busy,
  onStart,
  onStop
}) {
  const [deviceId, setDeviceId] = useState("");
  const [now, setNow] = useState(Date.now());
  const activeDevices = useMemo(() => devices.filter(device => device.status === "active"), [devices]);

  useEffect(() => {
    if (!deviceId && activeDevices[0]) setDeviceId(activeDevices[0].deviceId);
    if (deviceId && !activeDevices.some(device => device.deviceId === deviceId)) setDeviceId(activeDevices[0]?.deviceId || "");
  }, [activeDevices, deviceId]);

  useEffect(() => {
    if (!sessionInfo?.active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sessionInfo?.active]);

  const canStart = Boolean(
    policy?.trackingEnabled
    && (!policy.requireAcknowledgement || policy.acknowledgementStatus?.acknowledged)
    && deviceId
  );

  if (sessionInfo?.active) {
    const session = sessionInfo.session;
    return <section className="card border-emerald-200 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Tracking active</p><h2 className="mt-1 text-xl font-bold">{formatElapsed(session.startedAt, now)}</h2><p className="mt-2 text-sm text-slate-500">Started {formatDateTime(session.startedAt)}</p></div>
        <button type="button" disabled={busy} onClick={onStop} className="btn-secondary border-rose-200 text-rose-700"><Square className="h-4 w-4" />{busy ? "Stopping…" : "Stop tracking"}</button>
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-slate-500">Device</dt><dd className="font-semibold">{sessionInfo.device?.deviceName || session.deviceId}</dd></div>
        <div><dt className="text-slate-500">Project</dt><dd className="font-semibold">{session.projectId || "None"}</dd></div>
        <div><dt className="text-slate-500">Task</dt><dd className="font-semibold">{session.taskId || "None"}</dd></div>
        <div><dt className="text-slate-500">Policy</dt><dd className="font-semibold">Version {sessionInfo.policy?.policyVersion || policy?.policyVersion || "—"}</dd></div>
      </dl>
    </section>;
  }

  return <section className="card p-5 sm:p-6">
    <div><h2 className="font-bold">Current tracking session</h2><p className="mt-1 text-sm text-slate-500">Tracking starts only after you press the button below.</p></div>
    {!activeDevices.length
      ? <div className="mt-5"><ActivityEmptyState title="No active registered device" description="The desktop agent must register a device, and an authorised administrator must activate it, before tracking can start." /></div>
      : <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label><span className="label">Active device</span><select className="input" value={deviceId} onChange={event => setDeviceId(event.target.value)}>{activeDevices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.deviceName} · {device.platform}</option>)}</select></label>
        <label><span className="label">Project (optional)</span><select className="input" disabled><option value="">None</option></select></label>
        <label><span className="label">Task (optional)</span><select className="input" disabled><option value="">None</option></select></label>
        <div className="flex items-end"><button type="button" disabled={!canStart || busy} onClick={() => onStart({ deviceId, projectId: null, taskId: null })} className="btn-primary w-full"><Play className="h-4 w-4" />{busy ? "Starting…" : "Start tracking"}</button></div>
      </div>}
    <p className="mt-4 text-xs text-slate-500">The browser cannot monitor system-wide activity. This button controls a session for an already registered desktop agent. Project and task choices are unavailable until an activity-scoped assignment endpoint is provided.</p>
  </section>;
}
