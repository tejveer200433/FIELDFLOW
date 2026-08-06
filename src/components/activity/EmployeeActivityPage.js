"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAccess } from "@/components/AccessContext";
import ActivityDeviceList from "@/components/activity/ActivityDeviceList";
import ActivityErrorState from "@/components/activity/ActivityErrorState";
import ActivityLoadingState from "@/components/activity/ActivityLoadingState";
import ActivityPrivacyNotice from "@/components/activity/ActivityPrivacyNotice";
import ActivityStatusCard from "@/components/activity/ActivityStatusCard";
import ActivitySummaryCards from "@/components/activity/ActivitySummaryCards";
import ActivityTimeline from "@/components/activity/ActivityTimeline";
import ApplicationUsageSummary from "@/components/activity/ApplicationUsageSummary";
import BlockedSiteRequestForm from "@/components/activity/BlockedSiteRequestForm";
import CodingActivitySummary from "@/components/activity/CodingActivitySummary";
import CurrentTrackingSession from "@/components/activity/CurrentTrackingSession";
import InputActivitySummary from "@/components/activity/InputActivitySummary";
import MonitoringAcknowledgement from "@/components/activity/MonitoringAcknowledgement";
import MonitoringPolicyCard from "@/components/activity/MonitoringPolicyCard";
import ScreenshotActivitySummary from "@/components/activity/ScreenshotActivitySummary";
import WebsiteUsageSummary from "@/components/activity/WebsiteUsageSummary";
import { hasPermission } from "@/lib/permissions";
import {
  acknowledgePolicy,
  getActivePolicy,
  getCurrentSession,
  getDevices,
  getMyActivity,
  hashAcknowledgementText,
  startSession,
  stopSession
} from "@/lib/activity/client";
import { dateRange, formatDateTime, todayUtc } from "@/lib/activity/formatters";
import { deriveMonitoringStatus } from "@/lib/activity/status";

const ACTIVITY_VIEW_SELF = "activity.view_self";

const statusDescriptions = {
  unavailable: "A monitoring policy and an active desktop-agent device are required.",
  disabled: "Your organisation has disabled employee activity tracking.",
  acknowledgement: "Review and acknowledge the current policy before starting a session.",
  ready: "Your policy and device are ready. Tracking starts only when you choose Start tracking.",
  active: "A work tracking session is currently active on your registered device.",
  offline: "A session is active, but the most recent device heartbeat is stale or unavailable.",
  error: "Some activity information could not be refreshed. Existing records remain unchanged."
};

export default function EmployeeActivityPage() {
  const access = useAccess();
  const permitted = hasPermission(access, ACTIVITY_VIEW_SELF);
  const employeeId = access?.profile?.id;
  const [policy, setPolicy] = useState(null);
  const [devices, setDevices] = useState([]);
  const [sessionInfo, setSessionInfo] = useState({ active: false, session: null });
  const [activity, setActivity] = useState(null);
  const [rangeDays, setRangeDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const requestInFlight = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!permitted || !employeeId || requestInFlight.current) return;
    requestInFlight.current = true;
    const range = dateRange(rangeDays);
    const requests = [
      getActivePolicy(),
      getDevices(employeeId),
      getCurrentSession(),
      getMyActivity(employeeId, { ...range, limit: 50 })
    ];
    const results = await Promise.allSettled(requests);
    if (!mounted.current) return;
    const [policyResult, devicesResult, sessionResult, activityResult] = results;
    const failures = [];
    if (policyResult.status === "fulfilled") setPolicy(policyResult.value);
    else if (policyResult.reason?.code === "POLICY_NOT_CONFIGURED") setPolicy(null);
    else failures.push(policyResult.reason);
    if (devicesResult.status === "fulfilled") setDevices(devicesResult.value.devices || []);
    else failures.push(devicesResult.reason);
    if (sessionResult.status === "fulfilled") setSessionInfo(sessionResult.value);
    else failures.push(sessionResult.reason);
    if (activityResult.status === "fulfilled") setActivity(activityResult.value);
    else failures.push(activityResult.reason);
    setError(failures[0] || null);
    setLastRefreshed(new Date());
    setLoading(false);
    requestInFlight.current = false;
  }, [employeeId, permitted, rangeDays]);

  useEffect(() => {
    mounted.current = true;
    if (permitted) refresh();
    return () => { mounted.current = false; };
  }, [permitted, refresh]);

  useEffect(() => {
    if (!permitted) return undefined;
    const intervalMs = Math.max(30000, Math.min(60000, (policy?.heartbeatIntervalSeconds || 45) * 1000));
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [permitted, policy?.heartbeatIntervalSeconds, refresh]);

  async function acknowledge(text) {
    setBusy("acknowledge");
    setError(null);
    try {
      const hash = await hashAcknowledgementText(text);
      await acknowledgePolicy({
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        acknowledgementTextHash: hash
      });
      setNotice("Monitoring policy acknowledged.");
      await refresh();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy("");
    }
  }

  async function start(values) {
    setBusy("start");
    setError(null);
    try {
      await startSession(values);
      setNotice("Tracking active.");
      await refresh();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy("");
    }
  }

  async function stop() {
    if (!sessionInfo.session?.sessionId || !window.confirm("Stop your current tracking session?")) return;
    setBusy("stop");
    setError(null);
    try {
      const response = await stopSession(sessionInfo.session.sessionId);
      setNotice(`Tracking stopped at ${formatDateTime(response.data?.endedAt)}.`);
      await refresh();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusy("");
    }
  }

  const todaySummary = useMemo(
    () => activity?.dailySummaries?.find(item => item.date === todayUtc()) || null,
    [activity]
  );
  const rangeTrackedSeconds = useMemo(
    () => (activity?.dailySummaries || []).reduce((total, item) => total + (Number(item.trackedSeconds) || 0), 0),
    [activity]
  );
  const heartbeat = activity?.recentHeartbeat || null;
  const monitoringStatus = deriveMonitoringStatus({ policy, sessionInfo, devices, heartbeat, error });

  if (!permitted) {
    return <section className="card p-10 text-center"><h1 className="text-xl font-bold">Module not available</h1><p className="mt-2 text-slate-500">Your assigned role does not include permission for this module.</p></section>;
  }
  if (loading) return <ActivityLoadingState label="Loading your activity…" />;

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Employee workspace</p><h1 className="mt-1 text-3xl font-extrabold text-slate-950">My Activity</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">View your work tracking sessions, activity summaries, devices, and monitoring policy.</p></div>
      <div className="flex items-center gap-3"><span className="text-xs text-slate-500">Last refreshed {lastRefreshed ? formatDateTime(lastRefreshed) : "never"}</span><button type="button" onClick={() => refresh()} className="btn-secondary"><RefreshCw className="h-4 w-4" />Refresh</button></div>
    </header>
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</div>}
    {error && <ActivityErrorState error={error} onRetry={() => refresh()} />}
    <ActivityStatusCard status={monitoringStatus} description={statusDescriptions[monitoringStatus.key]} />
    <CurrentTrackingSession sessionInfo={sessionInfo} devices={devices} policy={policy} busy={busy === "start" || busy === "stop"} onStart={start} onStop={stop} />
    <ActivitySummaryCards summary={todaySummary} />
    <InputActivitySummary activity={activity?.todayInputActivity} />
    <div className="grid gap-6 xl:grid-cols-2">
      <MonitoringPolicyCard policy={policy} />
      <MonitoringAcknowledgement policy={policy} busy={busy === "acknowledge"} onAcknowledge={acknowledge} />
    </div>
    <ActivityDeviceList devices={devices} heartbeat={heartbeat} heartbeatIntervalSeconds={policy?.heartbeatIntervalSeconds} />
    <div className="grid gap-6 xl:grid-cols-2">
      <ActivityTimeline sessions={activity?.timeline || []} rangeDays={rangeDays} onRangeChange={setRangeDays} />
      <ApplicationUsageSummary enabled={Boolean(policy?.collectApplicationNames)} usage={activity?.applicationUsage || []} sampleIntervalSeconds={policy?.sampleIntervalSeconds} trackedSeconds={rangeTrackedSeconds} />
    </div>
    <WebsiteUsageSummary usage={activity?.websiteUsage || []} />
    <CodingActivitySummary enabled={Boolean(policy?.collectCodingProjectNames)} usage={activity?.codingUsage || []} />
    <ScreenshotActivitySummary enabled={Boolean(policy?.collectScreenshots)} screenshots={activity?.screenshots || []} />
    {policy?.websiteBlockingEnabled && <Suspense fallback={null}><BlockedSiteRequestForm /></Suspense>}
    <section className="card p-5 text-sm text-slate-600">
      <h2 className="font-bold text-slate-900">Heartbeat and sync status</h2>
      {heartbeat
        ? <dl className="mt-3 grid gap-3 sm:grid-cols-3"><div><dt className="text-xs uppercase text-slate-500">Last heartbeat</dt><dd className="mt-1 font-semibold">{formatDateTime(heartbeat.recordedAt)}</dd></div><div><dt className="text-xs uppercase text-slate-500">Agent version</dt><dd className="mt-1 font-semibold">{heartbeat.agentVersion || "Not reported"}</dd></div><div><dt className="text-xs uppercase text-slate-500">Reported state</dt><dd className="mt-1 font-semibold capitalize">{heartbeat.onlineStatus || "Unknown"}</dd></div></dl>
        : <p className="mt-2 text-slate-500">No heartbeat has been received. Start the desktop agent to establish device status.</p>}
    </section>
    <ActivityPrivacyNotice policy={policy} />
  </div>;
}
