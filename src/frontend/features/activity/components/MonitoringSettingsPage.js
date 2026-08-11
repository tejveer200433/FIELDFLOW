"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, BellRing, ChevronRight, Laptop, LayoutDashboard, RefreshCw, Shield, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useAccess } from "@/frontend/contexts/AccessContext";
import AdminActivityErrorState from "@/frontend/features/activity/components/AdminActivityErrorState";
import AdminActivityLoadingState from "@/frontend/features/activity/components/AdminActivityLoadingState";
import BlocklistOverrideAdministration from "@/frontend/features/activity/components/BlocklistOverrideAdministration";
import MonitoringAuditLog from "@/frontend/features/activity/components/MonitoringAuditLog";
import MonitoringDeviceAdministration from "@/frontend/features/activity/components/MonitoringDeviceAdministration";
import MonitoringPolicyForm from "@/frontend/features/activity/components/MonitoringPolicyForm";
import MonitoringPolicyCard from "@/frontend/features/activity/components/MonitoringPolicyCard";
import MonitoringSettingsWarning from "@/frontend/features/activity/components/MonitoringSettingsWarning";
import WebAccessAdministration from "@/frontend/features/activity/components/WebAccessAdministration";
import { hasPermission } from "@/shared/permissions";
import {
  getMonitoringDevices,
  getMonitoringPolicy,
  reactivateMonitoringDevice,
  revokeMonitoringDevice,
  setDeviceScreenshotCapture,
  updateMonitoringPolicy
} from "@/frontend/features/activity/api/policyClient";
import { formatDateTime, formatRelativeTime } from "@/frontend/features/activity/utils/adminFormatters";

const sections = [
  ["overview", "Overview", LayoutDashboard],
  ["devices", "Devices", Laptop],
  ["access", "App & website access", ShieldCheck],
  ["tracking", "Tracking & privacy", SlidersHorizontal],
  ["alerts", "Requests & alerts", BellRing]
];

export default function MonitoringSettingsPage() {
  const access = useAccess();
  const permitted = Boolean(access?.isOwner || hasPermission(access, "activity.policies.manage"));
  const [section, setSection] = useState("overview");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [policy, setPolicy] = useState(null);
  const [devices, setDevices] = useState([]);
  const [deviceCursor, setDeviceCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(null);
  const [deviceError, setDeviceError] = useState(null);
  const [notice, setNotice] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const load = useCallback(async () => {
    if (!permitted) return;
    setLoading(true);
    setError(null);
    setDeviceError(null);
    const [policyResult, deviceResult] = await Promise.allSettled([
      getMonitoringPolicy(),
      getMonitoringDevices({ limit: 50 })
    ]);
    if (policyResult.status === "fulfilled") setPolicy(policyResult.value);
    else if (policyResult.reason?.code === "POLICY_NOT_CONFIGURED") setPolicy(null);
    else setError(policyResult.reason);
    if (deviceResult.status === "fulfilled") {
      setDevices(deviceResult.value.devices);
      setDeviceCursor(deviceResult.value.pagination?.nextCursor || null);
    } else setDeviceError(deviceResult.reason);
    setLastRefreshed(new Date());
    setLoading(false);
  }, [permitted]);

  useEffect(() => { if (permitted) load(); }, [load, permitted]);

  const deviceCounts = useMemo(() => devices.reduce((counts, device) => {
    counts.total += 1;
    if (Object.hasOwn(counts, device.status)) counts[device.status] += 1;
    return counts;
  }, { total: 0, pending: 0, active: 0, revoked: 0 }), [devices]);

  async function savePolicy(values) {
    setBusy("policy");
    setError(null);
    try {
      const response = await updateMonitoringPolicy(values);
      setNotice(response.message || "A new monitoring policy version is active.");
      await load();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy("");
    }
  }

  async function deviceAction(device, action) {
    setBusy(device.deviceId);
    setDeviceError(null);
    try {
      const response = action === "revoke"
        ? await revokeMonitoringDevice(device.deviceId)
        : await reactivateMonitoringDevice(device.deviceId);
      setDevices(current => current.map(item => item.deviceId === device.deviceId ? response.data : item));
      const label = action === "revoke" ? (device.status === "pending" ? "rejected" : "revoked") : (device.status === "pending" ? "approved" : "reactivated");
      setNotice(`Device ${label}.`);
    } catch (requestError) {
      setDeviceError(requestError);
    } finally {
      setBusy("");
    }
  }

  async function confirmDeviceAction(device, action) {
    const label = action === "revoke" ? "Reject" : "Approve";
    if (!window.confirm(`${label} ${device.deviceName}? This does not change device ownership.`)) return;
    await deviceAction(device, action);
  }

  async function setScreenshotCapture(device, enabled) {
    setBusy(device.deviceId);
    setDeviceError(null);
    try {
      const response = await setDeviceScreenshotCapture(device.deviceId, enabled);
      setDevices(current => current.map(item => item.deviceId === device.deviceId
        ? { ...item, screenshotCaptureEnabled: response.data.screenshotCaptureEnabled, screenshotCaptureMode: "override" }
        : item));
      setNotice(response.message || `Screenshot capture ${enabled ? "enabled" : "disabled"} for ${device.deviceName}.`);
    } catch (requestError) {
      setDeviceError(requestError);
    } finally {
      setBusy("");
    }
  }

  async function loadMoreDevices() {
    if (!deviceCursor) return;
    setBusy("devices");
    try {
      const page = await getMonitoringDevices({ cursor: deviceCursor, limit: 50 });
      const merged = new Map(devices.map(device => [device.deviceId, device]));
      for (const device of page.devices) merged.set(device.deviceId, device);
      setDevices(Array.from(merged.values()));
      setDeviceCursor(page.pagination?.nextCursor || null);
    } catch (requestError) {
      setDeviceError(requestError);
    } finally {
      setBusy("");
    }
  }

  function openDevices(filter = "all") {
    setDeviceFilter(filter);
    setSection("devices");
  }

  if (!permitted) return <section className="card p-10 text-center"><h1 className="text-xl font-bold">Module not available</h1><p className="mt-2 text-slate-500">Your assigned role does not include permission for this module.</p></section>;
  if (loading && !policy) return <AdminActivityLoadingState label="Loading monitoring settings…" />;

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Administration</p><h1 className="mt-1 text-3xl font-extrabold">Monitoring</h1><p className="mt-2 text-sm text-slate-500">Approve devices, control access, and manage employee privacy from one place.</p></div>
      <div className="flex flex-wrap items-center gap-3"><Link href="/admin/activity" className="btn-secondary"><Activity className="h-4 w-4" />View workforce activity</Link><span className="text-xs text-slate-500">Updated {lastRefreshed ? formatDateTime(lastRefreshed) : "never"}</span><button type="button" disabled={loading} onClick={load} className="btn-secondary"><RefreshCw className="h-4 w-4" />Refresh</button></div>
    </header>

    <nav aria-label="Monitoring sections" className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      {sections.map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setSection(id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${section === id ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}><Icon className="h-4 w-4" />{label}{id === "devices" && deviceCounts.pending > 0 && <span className={`rounded-full px-2 py-0.5 text-xs ${section === id ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"}`}>{deviceCounts.pending}</span>}</button>)}
    </nav>

    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{notice}</div>}
    {error && <AdminActivityErrorState error={error} onRetry={load} />}

    {section === "overview" && <div className="space-y-6">
      <MonitoringSettingsWarning policy={policy} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[["Pending approval", deviceCounts.pending, "pending", "text-amber-600"], ["Active devices", deviceCounts.active, "active", "text-emerald-600"], ["Revoked devices", deviceCounts.revoked, "revoked", "text-slate-600"], ["Registered devices", deviceCounts.total, "all", "text-blue-600"]].map(([label, count, filter, tone]) => <button type="button" key={label} onClick={() => openDevices(filter)} className="card p-5 text-left transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"><span className={`text-xs font-bold uppercase tracking-wide ${tone}`}>{label}</span><span className="mt-2 block text-3xl font-extrabold">{count}</span><span className="mt-2 flex items-center text-xs font-semibold text-blue-600">View devices <ChevronRight className="h-3.5 w-3.5" /></span></button>)}
      </section>
      {deviceCounts.pending > 0 && <section className="card overflow-hidden"><div className="flex items-center justify-between border-b p-5"><div><h2 className="font-bold">Devices awaiting approval</h2><p className="text-sm text-slate-500">Approve known employee computers before tracking can begin.</p></div><button type="button" className="btn-secondary" onClick={() => openDevices("pending")}>Review all</button></div><div className="divide-y">{devices.filter(device => device.status === "pending").slice(0, 3).map(device => <article key={device.deviceId} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><strong>{device.employeeName || "Employee"}</strong><p className="text-sm text-slate-600">{device.deviceName} · Agent {device.agentVersion}</p><p className="text-xs text-slate-400">Registered {formatRelativeTime(device.registeredAt)}</p></div><div className="flex gap-2"><button type="button" disabled={busy === device.deviceId} className="btn-primary" onClick={() => confirmDeviceAction(device, "reactivate")}>Approve</button><button type="button" disabled={busy === device.deviceId} className="btn-secondary text-rose-700" onClick={() => confirmDeviceAction(device, "revoke")}>Reject</button></div></article>)}</div></section>}
      <section className="grid gap-4 md:grid-cols-3">
        <button type="button" onClick={() => setSection("access")} className="card p-5 text-left"><ShieldCheck className="h-6 w-6 text-blue-600" /><strong className="mt-4 block">Manage app and website access</strong><p className="mt-1 text-sm text-slate-500">Create restrictions or give an employee an exception.</p></button>
        <button type="button" onClick={() => setSection("tracking")} className="card p-5 text-left"><SlidersHorizontal className="h-6 w-6 text-blue-600" /><strong className="mt-4 block">Configure tracking and privacy</strong><p className="mt-1 text-sm text-slate-500">Control collection, retention, screenshots, and acknowledgements.</p></button>
        <button type="button" onClick={() => setSection("alerts")} className="card p-5 text-left"><BellRing className="h-6 w-6 text-blue-600" /><strong className="mt-4 block">Review requests and alerts</strong><p className="mt-1 text-sm text-slate-500">Handle access requests and unhealthy browser extensions.</p></button>
      </section>
    </div>}

    {section === "devices" && <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{[["all", "All", deviceCounts.total], ["pending", "Pending", deviceCounts.pending], ["active", "Active", deviceCounts.active], ["revoked", "Revoked", deviceCounts.revoked]].map(([id, label, count]) => <button type="button" key={id} onClick={() => setDeviceFilter(id)} className={`rounded-full border px-4 py-2 text-sm font-semibold ${deviceFilter === id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>{label} ({count})</button>)}</div>
      <MonitoringDeviceAdministration devices={devices} statusFilter={deviceFilter} screenshotsGloballyEnabled={Boolean(policy?.collectScreenshots)} error={deviceError} busyDeviceId={busy} nextCursor={deviceCursor} loadingMore={busy === "devices"} onAction={deviceAction} onScreenshotCaptureChange={setScreenshotCapture} onLoadMore={loadMoreDevices} />
    </div>}

    {section === "access" && <div className="space-y-6">{policy?.websiteBlockingEnabled && <BlocklistOverrideAdministration />}<WebAccessAdministration view="rules" /></div>}

    {section === "tracking" && <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2"><MonitoringPolicyCard policy={policy} /><section className="card p-5"><h2 className="font-bold">What employees can see</h2><p className="mt-2 text-sm leading-6 text-slate-600">Employees use a visible agent and acknowledge the active policy when required. Typed content, passwords, clipboard contents, mouse coordinates, URLs, window titles, and full paths are not collected.</p><div className="mt-4 flex gap-3 text-sm"><Shield className="h-5 w-5 text-blue-600" /><span>Attendance and location sharing remain separate features.</span></div></section></div>
      <MonitoringPolicyForm policy={policy} busy={busy === "policy"} onSave={savePolicy} />
    </div>}

    {section === "alerts" && <div className="space-y-6"><WebAccessAdministration view="alerts" /><MonitoringAuditLog /></div>}
  </div>;
}
