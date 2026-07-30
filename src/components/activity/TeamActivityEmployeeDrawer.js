"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import ApplicationUsageSummary from "@/components/activity/ApplicationUsageSummary";
import InputActivitySummary from "@/components/activity/InputActivitySummary";
import TeamActivityErrorState from "@/components/activity/TeamActivityErrorState";
import TeamActivityLoadingState from "@/components/activity/TeamActivityLoadingState";
import TeamActivityStatusBadge from "@/components/activity/TeamActivityStatusBadge";
import TeamActivityTimeline from "@/components/activity/TeamActivityTimeline";
import { getEmployeeActivityDetails } from "@/lib/activity/managerClient";
import { dateRange, formatDateTime, formatDuration, formatPercentage, shortIdentifier } from "@/lib/activity/teamFormatters";

export default function TeamActivityEmployeeDrawer({ employee, policy, onClose }) {
  const [rangeDays, setRangeDays] = useState(7);
  const [details, setDetails] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setDetails(null);
    setError(null);
    setLoading(true);
    getEmployeeActivityDetails(employee.employeeId, { ...dateRange(rangeDays), limit: 50 })
      .then(value => { if (active) setDetails(value); })
      .catch(requestError => { if (active) setError(requestError); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [employee.employeeId, rangeDays]);

  const currentSession = details?.currentSession;
  const device = useMemo(
    () => details?.devices?.find(item => item.deviceId === currentSession?.deviceId) || details?.devices?.[0] || null,
    [currentSession?.deviceId, details?.devices]
  );
  const latestSummary = details?.dailySummaries?.[0] || null;

  return <div className="fixed inset-0 z-[1100] flex justify-end bg-slate-950/40" role="dialog" aria-modal="true" aria-label={`${employee.employeeName} activity details`}>
    <button aria-label="Close employee activity details" type="button" className="absolute inset-0 cursor-default" onClick={onClose} />
    <aside className="relative h-full w-full max-w-2xl overflow-y-auto bg-[#f7f9fc] shadow-2xl">
      <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-slate-200 bg-white/95 p-5 backdrop-blur sm:p-6"><div className="flex-1"><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Employee activity</p><h2 className="mt-1 text-2xl font-extrabold">{employee.employeeName}</h2><div className="mt-2"><TeamActivityStatusBadge status={details?.currentStatus || employee.currentStatus} /></div></div><button type="button" onClick={onClose} className="icon-button"><X className="h-5 w-5" /></button></header>
      <div className="space-y-5 p-5 sm:p-6">
        <label className="block"><span className="label">History range</span><select className="input" value={rangeDays} onChange={event => setRangeDays(Number(event.target.value))}><option value={1}>Today</option><option value={2}>Today and yesterday</option><option value={7}>Last 7 days</option></select></label>
        {loading && <TeamActivityLoadingState label="Loading employee activity details…" />}
        {error && <TeamActivityErrorState error={error} />}
        {!loading && !error && details && <>
          <section className="card p-5"><h3 className="font-bold">Current tracking context</h3><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Session</dt><dd className="mt-1 font-semibold">{currentSession ? `Active · ${shortIdentifier(currentSession.sessionId)}` : "Not tracking"}</dd></div>
            <div><dt className="text-slate-500">Started</dt><dd className="mt-1 font-semibold">{formatDateTime(currentSession?.startedAt)}</dd></div>
            <div><dt className="text-slate-500">Project</dt><dd className="mt-1 font-semibold">{shortIdentifier(currentSession?.projectId)}</dd></div>
            <div><dt className="text-slate-500">Task</dt><dd className="mt-1 font-semibold">{shortIdentifier(currentSession?.taskId)}</dd></div>
            <div><dt className="text-slate-500">Current application</dt><dd className="mt-1 font-semibold">{policy?.collectApplicationNames ? employee.activeApplication || "No application update" : "Collection disabled"}</dd></div>
            <div><dt className="text-slate-500">Last activity sample</dt><dd className="mt-1 font-semibold">Not provided by API</dd></div>
          </dl></section>
          <section className="card p-5"><h3 className="font-bold">Device and heartbeat</h3>{device ? <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Device</dt><dd className="mt-1 font-semibold">{device.deviceName}</dd></div><div><dt className="text-slate-500">Platform</dt><dd className="mt-1 font-semibold">{device.platform}{device.operatingSystemVersion ? ` · ${device.operatingSystemVersion}` : ""}</dd></div><div><dt className="text-slate-500">Agent version</dt><dd className="mt-1 font-semibold">{details.recentHeartbeat?.agentVersion || device.agentVersion || "Not reported"}</dd></div><div><dt className="text-slate-500">Last heartbeat</dt><dd className="mt-1 font-semibold">{formatDateTime(details.recentHeartbeat?.recordedAt)}</dd></div></dl> : <p className="mt-3 text-sm text-slate-500">No registered devices are visible in your authorised scope.</p>}</section>
          <section className="card p-5"><h3 className="font-bold">Daily summary</h3><dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-5"><div><dt className="text-slate-500">Tracked</dt><dd className="mt-1 font-semibold">{formatDuration(latestSummary?.trackedSeconds)}</dd></div><div><dt className="text-slate-500">Active</dt><dd className="mt-1 font-semibold">{formatDuration(latestSummary?.activeSeconds)}</dd></div><div><dt className="text-slate-500">Idle</dt><dd className="mt-1 font-semibold">{formatDuration(latestSummary?.idleSeconds)}</dd></div><div><dt className="text-slate-500">Offline</dt><dd className="mt-1 font-semibold">{formatDuration(latestSummary?.offlineSeconds)}</dd></div><div><dt className="text-slate-500">Activity level</dt><dd className="mt-1 font-semibold">{formatPercentage(latestSummary?.activityPercentage)}</dd></div></dl></section>
          <InputActivitySummary activity={details.todayInputActivity} />
          <section className="card p-5"><div className="mb-4"><h3 className="font-bold">Grouped timeline</h3><p className="text-sm text-slate-500">Session-level records for the selected range.</p></div><TeamActivityTimeline sessions={details.timeline} /></section>
          <ApplicationUsageSummary enabled={Boolean(policy?.collectApplicationNames)} usage={details.applicationUsage || []} sampleIntervalSeconds={policy?.sampleIntervalSeconds} trackedSeconds={latestSummary?.trackedSeconds || 0} />
        </>}
      </div>
    </aside>
  </div>;
}
