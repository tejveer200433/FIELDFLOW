"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Shield } from "lucide-react";
import { useAccess } from "@/components/AccessContext";
import AdminActivityErrorState from "@/components/activity/AdminActivityErrorState";
import AdminActivityLoadingState from "@/components/activity/AdminActivityLoadingState";
import MonitoringAcknowledgementSummary from "@/components/activity/MonitoringAcknowledgementSummary";
import MonitoringAuditLog from "@/components/activity/MonitoringAuditLog";
import MonitoringDeviceAdministration from "@/components/activity/MonitoringDeviceAdministration";
import MonitoringPolicyForm from "@/components/activity/MonitoringPolicyForm";
import MonitoringPolicyHistory from "@/components/activity/MonitoringPolicyHistory";
import MonitoringPolicyCard from "@/components/activity/MonitoringPolicyCard";
import MonitoringSettingsWarning from "@/components/activity/MonitoringSettingsWarning";
import { hasPermission } from "@/lib/permissions";
import {
  getMonitoringDevices,
  getMonitoringPolicy,
  reactivateMonitoringDevice,
  revokeMonitoringDevice,
  updateMonitoringPolicy
} from "@/lib/activity/policyClient";
import { formatDateTime, formatDuration } from "@/lib/activity/adminFormatters";

export default function MonitoringSettingsPage() {
  const access = useAccess();
  const permitted = Boolean(access?.isOwner || hasPermission(access, "activity.policies.manage"));
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
      setNotice(`Device ${action === "revoke" ? "revoked" : "reactivated"}.`);
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

  if (!permitted) return <section className="card p-10 text-center"><h1 className="text-xl font-bold">Module not available</h1><p className="mt-2 text-slate-500">Your assigned role does not include permission for this module.</p></section>;
  if (loading && !policy) return <AdminActivityLoadingState label="Loading monitoring settings…" />;
  return <div className="space-y-6"><header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Administration</p><h1 className="mt-1 text-3xl font-extrabold">Monitoring Settings</h1><p className="mt-2 text-sm text-slate-500">Create versioned monitoring policies and administer registered activity devices.</p></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">Last refreshed {lastRefreshed ? formatDateTime(lastRefreshed) : "never"}</span><button type="button" disabled={loading} onClick={load} className="btn-secondary"><RefreshCw className="h-4 w-4" />Refresh</button></div></header>
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{notice}</div>}
    {error && <AdminActivityErrorState error={error} onRetry={load} />}
    <MonitoringSettingsWarning policy={policy} />
    <div className="grid gap-6 xl:grid-cols-2"><MonitoringPolicyCard policy={policy} /><section className="card p-5"><h2 className="font-bold">Additional active-policy settings</h2><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-slate-500">Offline synchronisation limit</dt><dd className="font-semibold">{formatDuration(policy?.offlineSyncLimitSeconds)}</dd></div><div><dt className="text-slate-500">Created and updated time</dt><dd className="font-semibold">Not exposed by Phase 2 API</dd></div></dl></section></div>
    <MonitoringPolicyForm policy={policy} busy={busy === "policy"} onSave={savePolicy} />
    <div className="grid gap-6 xl:grid-cols-2"><MonitoringPolicyHistory /><MonitoringAcknowledgementSummary policy={policy} /></div>
    <MonitoringDeviceAdministration devices={devices} error={deviceError} busyDeviceId={busy} nextCursor={deviceCursor} loadingMore={busy === "devices"} onAction={deviceAction} onLoadMore={loadMoreDevices} />
    <MonitoringAuditLog />
    <section className="card p-5"><div className="flex gap-3"><Shield className="h-5 w-5 text-blue-600" /><div><h2 className="font-bold">Privacy and separation</h2><p className="mt-2 text-sm leading-6 text-slate-600">Activity tracking records aggregate input counts and session state only during explicit work sessions. Typed content, passwords, clipboard contents, screenshots, mouse coordinates, URLs, window titles, and full paths are not collected. Attendance and employee location sharing remain separate FIELD-FLOW features.</p></div></div></section>
  </div>;
}
