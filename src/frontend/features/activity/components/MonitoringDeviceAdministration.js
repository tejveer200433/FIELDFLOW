"use client";

import { Laptop, ShieldCheck } from "lucide-react";
import AdminActivityEmptyState from "@/frontend/features/activity/components/AdminActivityEmptyState";
import AdminActivityErrorState from "@/frontend/features/activity/components/AdminActivityErrorState";
import AndroidScreenshotRequest from "@/frontend/features/activity/components/AndroidScreenshotRequest";
import { formatDateTime, formatRelativeTime } from "@/frontend/features/activity/utils/adminFormatters";

export default function MonitoringDeviceAdministration({
  devices,
  screenshotsGloballyEnabled,
  error,
  busyDeviceId,
  nextCursor,
  loadingMore,
  onAction,
  onModeChange,
  onScreenshotCaptureChange,
  onLoadMore,
  statusFilter = "all"
}) {
  async function act(device, action) {
    const label = action === "revoke" ? (device.status === "pending" ? "Reject" : "Revoke") : (device.status === "pending" ? "Approve" : "Reactivate");
    if (!window.confirm(`${label} ${device.deviceName}? This does not change device ownership.`)) return;
    await onAction(device, action);
  }

  async function changeMode(device) {
    const nextMode = device.agentMode === "corporate" ? "standard" : "corporate";
    const detail = nextMode === "corporate"
      ? "This disables employee sign-out and quit controls, enables automatic tracking recovery, and keeps the installation visible."
      : "This restores employee sign-out and quit controls.";
    if (!window.confirm(`Switch ${device.deviceName} to ${nextMode} mode? ${detail}`)) return;
    await onModeChange(device, nextMode);
  }

  const visibleDevices = statusFilter === "all" ? devices : devices.filter(device => device.status === statusFilter);

  return <section className="card p-5 sm:p-6">
    <div className="flex items-center gap-3"><Laptop className="h-5 w-5 text-blue-600" /><div><h2 className="font-bold">Device administration</h2><p className="text-sm text-slate-500">Approve devices, select Standard or Corporate Agent mode, and control screenshot capture.</p></div></div>
    {error && <div className="mt-4"><AdminActivityErrorState error={error} /></div>}
    {!error && !visibleDevices.length && <div className="mt-5"><AdminActivityEmptyState title={statusFilter === "all" ? "No registered devices" : `No ${statusFilter} devices`} description={statusFilter === "all" ? "Devices appear after the desktop or Android app registers them." : `There are no devices with ${statusFilter} status.`} /></div>}
    {!error && visibleDevices.length > 0 && <div className="mt-5 divide-y">{visibleDevices.map(device => <article className="flex flex-col gap-4 py-4 first:pt-0 lg:flex-row lg:items-start" key={device.deviceId}>
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2"><strong>{device.deviceName}</strong><span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${device.status === "pending" ? "bg-amber-50 text-amber-700" : device.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{device.status}</span><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${device.agentMode === "corporate" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}><ShieldCheck className="h-3.5 w-3.5" />{device.operatingSystemVersion?.startsWith("Android ") ? "Android App" : device.agentMode === "corporate" ? "Corporate Agent" : "Standard Agent"}</span></div>
        <p className="mt-1 text-sm font-medium text-slate-700">{device.employeeName || "Employee"}{device.employeeEmail ? ` · ${device.employeeEmail}` : ""}</p>
        <p className="mt-1 text-sm text-slate-500">{device.platform}{device.operatingSystemVersion ? ` · ${device.operatingSystemVersion}` : ""} · Agent {device.agentVersion}</p>
        <p className="mt-1 text-xs text-slate-500">Registered {formatDateTime(device.registeredAt)} · Last seen {formatRelativeTime(device.lastSeenAt)}{device.revokedAt ? ` · Revoked ${formatDateTime(device.revokedAt)}` : ""}</p>
        <p className="mt-1 text-xs text-slate-400">{device.operatingSystemVersion?.startsWith("Android ") ? "Visible work tracking with employee stop controls. Screen sharing needs Android approval." : device.agentMode === "corporate" ? "Administrator managed: local sign-out and quit are disabled; recovery remains enabled." : "Employee ownership is server-controlled."}</p>
      </div>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(device.screenshotCaptureEnabled)} disabled={busyDeviceId === device.deviceId} onChange={event => onScreenshotCaptureChange(device, event.target.checked)} /><span>Screenshots</span></label>
        {device.operatingSystemVersion?.startsWith("Android ")
          ? <AndroidScreenshotRequest device={device} enabled={screenshotsGloballyEnabled && device.screenshotCaptureEnabled} />
          : <button type="button" title={device.managementAvailable === false ? "The corporate-agent database migration is required for management controls." : undefined} disabled={device.managementAvailable === false || busyDeviceId === device.deviceId || device.status === "revoked"} onClick={() => changeMode(device)} className="btn-secondary"><ShieldCheck className="h-4 w-4" />{device.agentMode === "corporate" ? "Use Standard" : "Manage device"}</button>}
        {device.status === "pending" && <>
          <button type="button" disabled={busyDeviceId === device.deviceId} onClick={() => act(device, "reactivate")} className="btn-primary">{busyDeviceId === device.deviceId ? "Approving…" : "Approve"}</button>
          <button type="button" disabled={busyDeviceId === device.deviceId} onClick={() => act(device, "revoke")} className="btn-secondary border-rose-200 text-rose-700">Reject</button>
        </>}
        {device.status === "revoked" && <button type="button" disabled={busyDeviceId === device.deviceId} onClick={() => act(device, "reactivate")} className="btn-secondary">{busyDeviceId === device.deviceId ? "Updating…" : "Reactivate"}</button>}
        {device.status === "active" && <button type="button" disabled={busyDeviceId === device.deviceId} onClick={() => act(device, "revoke")} className="btn-secondary border-rose-200 text-rose-700">{busyDeviceId === device.deviceId ? "Updating…" : "Revoke"}</button>}
      </div>
      {!screenshotsGloballyEnabled && <p className="text-xs text-amber-700 lg:w-48">The organisation screenshot policy is off; this device setting will apply when it is enabled.</p>}
    </article>)}</div>}
    {nextCursor && <button type="button" disabled={loadingMore} onClick={onLoadMore} className="btn-secondary mt-4">{loadingMore ? "Loading…" : "Load more devices"}</button>}
  </section>;
}
