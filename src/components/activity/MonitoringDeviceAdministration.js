"use client";

import { Laptop } from "lucide-react";
import AdminActivityEmptyState from "@/components/activity/AdminActivityEmptyState";
import AdminActivityErrorState from "@/components/activity/AdminActivityErrorState";
import { formatDateTime, formatRelativeTime } from "@/lib/activity/adminFormatters";

export default function MonitoringDeviceAdministration({
  devices,
  screenshotsGloballyEnabled,
  error,
  busyDeviceId,
  nextCursor,
  loadingMore,
  onAction,
  onScreenshotCaptureChange,
  onLoadMore
}) {
  async function act(device, action) {
    const verb = action === "revoke" ? "revoke" : "reactivate";
    if (!window.confirm(`${verb === "revoke" ? "Revoke" : "Reactivate"} ${device.deviceName}? This does not change device ownership.`)) return;
    await onAction(device, action);
  }

  return <section className="card p-5 sm:p-6">
    <div className="flex items-center gap-3"><Laptop className="h-5 w-5 text-blue-600" /><div><h2 className="font-bold">Device administration</h2><p className="text-sm text-slate-500">Revoke devices and control screenshot capture for each device.</p></div></div>
    {error && <div className="mt-4"><AdminActivityErrorState error={error} /></div>}
    {!error && !devices.length && <div className="mt-5"><AdminActivityEmptyState title="No registered devices" description="Devices appear after the visible desktop agent registers them." /></div>}
    {!error && devices.length > 0 && <div className="mt-5 divide-y">{devices.map(device => <article className="flex flex-col gap-4 py-4 first:pt-0 lg:flex-row lg:items-start" key={device.deviceId}>
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2"><strong>{device.deviceName}</strong><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold capitalize">{device.status}</span></div>
        <p className="mt-1 text-sm font-medium text-slate-700">{device.employeeName || "Employee"}{device.employeeEmail ? ` · ${device.employeeEmail}` : ""}</p>
        <p className="mt-1 text-sm text-slate-500">{device.platform}{device.operatingSystemVersion ? ` · ${device.operatingSystemVersion}` : ""} · Agent {device.agentVersion}</p>
        <p className="mt-1 text-xs text-slate-500">Registered {formatDateTime(device.registeredAt)} · Last seen {formatRelativeTime(device.lastSeenAt)}{device.revokedAt ? ` · Revoked ${formatDateTime(device.revokedAt)}` : ""}</p>
        <p className="mt-1 text-xs text-slate-400">Employee ownership is server-controlled.</p>
      </div>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(device.screenshotCaptureEnabled)} disabled={busyDeviceId === device.deviceId} onChange={event => onScreenshotCaptureChange(device, event.target.checked)} /><span>Screenshots</span></label>
        {device.status === "revoked"
          ? <button type="button" disabled={busyDeviceId === device.deviceId} onClick={() => act(device, "reactivate")} className="btn-secondary">{busyDeviceId === device.deviceId ? "Updating…" : "Reactivate"}</button>
          : <button type="button" disabled={busyDeviceId === device.deviceId} onClick={() => act(device, "revoke")} className="btn-secondary border-rose-200 text-rose-700">{busyDeviceId === device.deviceId ? "Updating…" : "Revoke"}</button>}
      </div>
      {!screenshotsGloballyEnabled && <p className="text-xs text-amber-700 lg:w-48">The organisation screenshot policy is off; this device setting will apply when it is enabled.</p>}
    </article>)}</div>}
    {nextCursor && <button type="button" disabled={loadingMore} onClick={onLoadMore} className="btn-secondary mt-4">{loadingMore ? "Loading…" : "Load more devices"}</button>}
  </section>;
}
