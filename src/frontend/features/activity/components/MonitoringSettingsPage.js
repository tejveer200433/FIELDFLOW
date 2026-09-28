"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, BellRing, CheckCircle2, ChevronRight, Laptop, LayoutDashboard, RefreshCw, Shield, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useAccess } from "@/frontend/contexts/AccessContext";
import AdminActivityErrorState from "@/frontend/features/activity/components/AdminActivityErrorState";
import AdminActivityLoadingState from "@/frontend/features/activity/components/AdminActivityLoadingState";
import BlocklistOverrideAdministration from "@/frontend/features/activity/components/BlocklistOverrideAdministration";
import MonitoringAuditLog from "@/frontend/features/activity/components/MonitoringAuditLog";
import MonitoringDeviceAdministration from "@/frontend/features/activity/components/MonitoringDeviceAdministration";
import MonitoringPolicyForm from "@/frontend/features/activity/components/MonitoringPolicyForm";
import MonitoringPolicyCard from "@/frontend/features/activity/components/MonitoringPolicyCard";
import MonitoringSettingsWarning from "@/frontend/features/activity/components/MonitoringSettingsWarning";
import MonitoringSystemPulse from "@/frontend/features/activity/components/MonitoringSystemPulse";
import WebAccessAdministration from "@/frontend/features/activity/components/WebAccessAdministration";
import { hasPermission } from "@/shared/permissions";
import {
  getMonitoringDevices,
  getMonitoringPolicy,
  reactivateMonitoringDevice,
  revokeMonitoringDevice,
  setMonitoringDeviceMode,
  setDeviceScreenshotCapture,
  updateMonitoringPolicy
} from "@/frontend/features/activity/api/policyClient";
import { formatDateTime, formatRelativeTime } from "@/frontend/features/activity/utils/adminFormatters";
import { getExtensionHealth, getWebAccessEvents, getWebAccessRequests } from "@/frontend/features/activity/api/webAccessClient";

const sections = [
  ["overview", "Overview", LayoutDashboard],
  ["devices", "Devices", Laptop],
  ["access", "App & website access", ShieldCheck],
  ["tracking", "Tracking & privacy", SlidersHorizontal],
  ["alerts", "Requests & alerts", BellRing]
];

function MonitoringOverview({
  deviceCounts, deviceHealthPercent, accessSummary, attentionCount, pendingRequests,
  unhealthyExtensions, hasOverviewData, overviewData, policy, activeInsight,
  onInsight, onOpenDevices, onOpenAlerts
}) {
  const metrics = [
    ["Registered devices", deviceCounts.total, "All known devices", "all", "healthy", Laptop],
    ["Active", deviceCounts.active, deviceCounts.active ? "Ready for normal work" : "No active devices yet", "active", "healthy", CheckCircle2],
    ["Need attention", attentionCount, attentionCount ? "Review devices or extension reporting" : "Nothing needs review", "pending", "attention", AlertTriangle],
    ["Access requests", overviewData.requests === null ? "—" : pendingRequests.length, overviewData.requests === null ? "Request data is unavailable" : pendingRequests.length ? "Waiting for a decision" : "You're all caught up", "alerts", "request", BellRing]
  ];
  const stateBars = [
    ["Active", deviceCounts.active, "bg-emerald-500", "text-emerald-700"],
    ["Pending", deviceCounts.pending, "bg-amber-400", "text-amber-700"],
    ["Revoked", deviceCounts.revoked, "bg-slate-300", "text-slate-600"]
  ];
  const controlBars = [["Web", accessSummary.web, "bg-blue-500"], ["Applications", accessSummary.applications, "bg-violet-500"], ["Extensions", accessSummary.extensions, "bg-amber-400"]];
  return <div className="space-y-5">
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_290px]">
      <div className="space-y-4"><MonitoringSettingsWarning policy={policy} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, detail, filter, insight, Icon]) => <button type="button" key={label} onMouseEnter={() => onInsight(insight)} onFocus={() => onInsight(insight)} onClick={() => filter === "alerts" ? onOpenAlerts() : onOpenDevices(filter)} className="group rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"><div className="flex items-start justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span><Icon className="h-4 w-4 text-blue-600 transition-transform duration-200 group-hover:translate-x-0.5" /></div><strong className="mt-3 block text-2xl text-slate-950">{value}</strong><span className="mt-2 block text-xs leading-5 text-slate-600">{detail}</span></button>)}
      </div></div><MonitoringSystemPulse emphasis={activeInsight} />
    </section>
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm"><div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5"><div><h2 className="font-bold text-slate-950">Needs your attention</h2><p className="mt-1 text-sm text-slate-600">I only surface things that may require a decision.</p></div>{attentionCount + pendingRequests.length > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">{attentionCount + pendingRequests.length} to review</span>}</div><div className="divide-y divide-slate-100">
        {deviceCounts.pending > 0 && <AttentionRow icon={AlertTriangle} tone="text-amber-600" title={`${deviceCounts.pending} device${deviceCounts.pending === 1 ? "" : "s"} awaiting approval`} detail="Tracking cannot begin until a known device is approved." onClick={() => onOpenDevices("pending")} />}
        {unhealthyExtensions.length > 0 && <AttentionRow icon={AlertTriangle} tone="text-amber-600" title={`${unhealthyExtensions.length} extension${unhealthyExtensions.length === 1 ? " hasn't" : "s haven't"} reported normally`} detail="Review browser health before assuming an employee is inactive." onClick={onOpenAlerts} />}
        {pendingRequests.length > 0 && <AttentionRow icon={BellRing} tone="text-blue-600" title={`${pendingRequests.length} access request${pendingRequests.length === 1 ? "" : "s"} waiting`} detail="A temporary exception needs an explicit decision." onClick={onOpenAlerts} />}
        {!attentionCount && !pendingRequests.length && <div className="flex items-center gap-3 p-5"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div><h3 className="text-sm font-bold">You're all caught up.</h3><p className="mt-1 text-xs text-slate-600">No devices or access requests need your attention.</p></div></div>}
      </div></div>
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold text-slate-950">Device health</h2><p className="mt-1 text-sm text-slate-600">Current registration state</p></div><strong className="text-2xl text-slate-950">{deviceHealthPercent === null ? "—" : `${deviceHealthPercent}%`}</strong></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${deviceHealthPercent || 0}%` }} /></div><p className="mt-3 text-sm text-slate-700">{deviceCounts.active} of {deviceCounts.total} registered devices are active.</p><button type="button" onClick={() => onOpenDevices("all")} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900">View devices <ChevronRight className="h-4 w-4" /></button></div>
    </section>
    <section className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold text-slate-950">Workforce pulse</h2><p className="mt-1 text-sm text-slate-600">Live device state distribution</p></div><span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" />Live</span></div><div className="mt-6 flex h-20 items-end gap-3" aria-label="Device state distribution">{stateBars.map(([label, count, color, tone]) => <div key={label} className="flex flex-1 flex-col justify-end"><span className={`mb-2 text-xs font-bold ${tone}`}>{label} {count}</span><span className={`block rounded-t ${color} transition-all duration-500`} style={{ height: `${Math.max(8, deviceCounts.total ? Math.round((count / deviceCounts.total) * 100) : 0)}%` }} /></div>)}</div><p className="mt-4 text-xs text-slate-500">This uses current device states; it is not a productivity score.</p></div>
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold text-slate-950">Activity controls</h2><p className="mt-1 text-sm text-slate-600">Privacy-safe recorded restriction events</p></div><button type="button" onClick={onOpenAlerts} className="text-sm font-semibold text-blue-700">Review</button></div>{hasOverviewData ? <><strong className="mt-5 block text-3xl text-slate-950">{accessSummary.total}</strong><p className="mt-1 text-sm text-slate-600">Recent recorded events</p><div className="mt-5 space-y-3 text-sm">{controlBars.map(([label, count, color]) => <div key={label}><div className="mb-1 flex justify-between"><span>{label}</span><strong>{count}</strong></div><div className="h-1.5 rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${accessSummary.total ? Math.round((count / accessSummary.total) * 100) : 0}%` }} /></div></div>)}</div></> : <p className="mt-6 text-sm text-slate-500">Activity-control data is unavailable right now. Refresh to try again.</p>}</div>
    </section>
  </div>;
}

function AttentionRow({ icon: Icon, tone, title, detail, onClick }) {
  return <button type="button" onClick={onClick} className="group flex w-full items-center gap-3 p-4 text-left transition hover:bg-amber-50"><Icon className={`h-5 w-5 ${tone}`} /><span className="min-w-0 flex-1"><strong className="block text-sm">{title}</strong><span className="text-xs text-slate-600">{detail}</span></span><ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-slate-700" /></button>;
}

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
  const [overviewData, setOverviewData] = useState({ requests: null, extensionHealth: null, events: null });
  const [activeInsight, setActiveInsight] = useState("healthy");

  const load = useCallback(async () => {
    if (!permitted) return;
    setLoading(true);
    setError(null);
    setDeviceError(null);
    const [policyResult, deviceResult, requestResult, healthResult, eventResult] = await Promise.allSettled([
      getMonitoringPolicy(),
      getMonitoringDevices({ limit: 50 }),
      getWebAccessRequests(),
      getExtensionHealth(),
      getWebAccessEvents()
    ]);
    if (policyResult.status === "fulfilled") setPolicy(policyResult.value);
    else if (policyResult.reason?.code === "POLICY_NOT_CONFIGURED") setPolicy(null);
    else setError(policyResult.reason);
    if (deviceResult.status === "fulfilled") {
      setDevices(deviceResult.value.devices);
      setDeviceCursor(deviceResult.value.pagination?.nextCursor || null);
    } else setDeviceError(deviceResult.reason);
    setOverviewData({
      requests: requestResult.status === "fulfilled" ? requestResult.value.requests || [] : null,
      extensionHealth: healthResult.status === "fulfilled" ? healthResult.value || [] : null,
      events: eventResult.status === "fulfilled" ? eventResult.value || [] : null
    });
    setLastRefreshed(new Date());
    setLoading(false);
  }, [permitted]);

  useEffect(() => { if (permitted) load(); }, [load, permitted]);

  const deviceCounts = useMemo(() => devices.reduce((counts, device) => {
    counts.total += 1;
    if (Object.hasOwn(counts, device.status)) counts[device.status] += 1;
    return counts;
  }, { total: 0, pending: 0, active: 0, revoked: 0 }), [devices]);

  const accessSummary = useMemo(() => (overviewData.events || []).reduce((summary, item) => {
    summary.total += 1;
    if (item.event_type === "domain_blocked") summary.web += 1;
    if (item.event_type === "application_blocked") summary.applications += 1;
    if (["extension_missing", "extension_disabled"].includes(item.event_type)) summary.extensions += 1;
    return summary;
  }, { total: 0, web: 0, applications: 0, extensions: 0 }), [overviewData.events]);
  const pendingRequests = overviewData.requests?.filter(item => item.status === "Pending") || [];
  const unhealthyExtensions = overviewData.extensionHealth?.filter(item => item.status !== "installed") || [];
  const deviceHealthPercent = deviceCounts.total ? Math.round((deviceCounts.active / deviceCounts.total) * 100) : null;
  const attentionCount = deviceCounts.pending + unhealthyExtensions.length;
  const hasOverviewData = overviewData.requests !== null && overviewData.extensionHealth !== null && overviewData.events !== null;

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

  async function setDeviceMode(device, mode) {
    setBusy(device.deviceId);
    setDeviceError(null);
    try {
      const response = await setMonitoringDeviceMode(device.deviceId, mode);
      setDevices(current => current.map(item => item.deviceId === device.deviceId ? response.data : item));
      setNotice(response.message || `${device.deviceName} is now using ${mode} mode.`);
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

  return <div className="space-y-5">
    <header className="grid gap-5 border-b border-slate-200 pb-5 lg:grid-cols-[minmax(0,1fr)_290px] lg:items-end">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Monitoring · live</p><h1 className="mt-2 text-2xl font-extrabold text-slate-950">Workforce health at a glance</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Everything important about your workforce, devices, and activity controls in one place.</p></div>
      <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end"><span className="text-xs text-slate-500">Last updated {lastRefreshed ? formatDateTime(lastRefreshed) : "never"}</span><button type="button" title="Refresh monitoring data" disabled={loading} onClick={load} className="icon-button h-9 w-9"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /><span className="sr-only">Refresh</span></button><Link href="/admin/activity" className="btn-secondary">Workforce activity <ChevronRight className="h-4 w-4" /></Link></div>
    </header>

    <nav aria-label="Monitoring sections" className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-px">
      {sections.map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setSection(id)} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${section === id ? "border-blue-600 bg-blue-50 text-blue-800" : "border-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}><Icon className="h-4 w-4" />{label}{id === "devices" && deviceCounts.pending > 0 && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">{deviceCounts.pending}</span>}</button>)}
    </nav>

    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{notice}</div>}
    {error && <AdminActivityErrorState error={error} onRetry={load} />}

    {false && section === "overview" && <div className="space-y-6">
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

    {section === "overview" && <MonitoringOverview deviceCounts={deviceCounts} deviceHealthPercent={deviceHealthPercent} accessSummary={accessSummary} attentionCount={attentionCount} pendingRequests={pendingRequests} unhealthyExtensions={unhealthyExtensions} hasOverviewData={hasOverviewData} overviewData={overviewData} policy={policy} activeInsight={activeInsight} onInsight={setActiveInsight} onOpenDevices={openDevices} onOpenAlerts={() => setSection("alerts")} />}

    {section === "devices" && <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{[["all", "All", deviceCounts.total], ["pending", "Pending", deviceCounts.pending], ["active", "Active", deviceCounts.active], ["revoked", "Revoked", deviceCounts.revoked]].map(([id, label, count]) => <button type="button" key={id} onClick={() => setDeviceFilter(id)} className={`rounded-full border px-4 py-2 text-sm font-semibold ${deviceFilter === id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>{label} ({count})</button>)}</div>
      <MonitoringDeviceAdministration devices={devices} statusFilter={deviceFilter} screenshotsGloballyEnabled={Boolean(policy?.collectScreenshots)} error={deviceError} busyDeviceId={busy} nextCursor={deviceCursor} loadingMore={busy === "devices"} onAction={deviceAction} onModeChange={setDeviceMode} onScreenshotCaptureChange={setScreenshotCapture} onLoadMore={loadMoreDevices} />
    </div>}

    {section === "access" && <div className="space-y-6">{policy?.websiteBlockingEnabled && <BlocklistOverrideAdministration />}<WebAccessAdministration view="rules" /></div>}

    {section === "tracking" && <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2"><MonitoringPolicyCard policy={policy} /><section className="card p-5"><h2 className="font-bold">What employees can see</h2><p className="mt-2 text-sm leading-6 text-slate-600">Employees use a visible agent and acknowledge the active policy when required. Typed content, passwords, clipboard contents, mouse coordinates, URLs, window titles, and full paths are not collected.</p><div className="mt-4 flex gap-3 text-sm"><Shield className="h-5 w-5 text-blue-600" /><span>Attendance and location sharing remain separate features.</span></div></section></div>
      <MonitoringPolicyForm policy={policy} busy={busy === "policy"} onSave={savePolicy} />
    </div>}

    {section === "alerts" && <div className="space-y-6"><WebAccessAdministration view="alerts" /><MonitoringAuditLog /></div>}
  </div>;
}
