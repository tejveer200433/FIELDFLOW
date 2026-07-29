"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAccess } from "@/components/AccessContext";
import TeamActivityEmployeeDrawer from "@/components/activity/TeamActivityEmployeeDrawer";
import TeamActivityErrorState from "@/components/activity/TeamActivityErrorState";
import TeamActivityFilters from "@/components/activity/TeamActivityFilters";
import TeamActivityLoadingState from "@/components/activity/TeamActivityLoadingState";
import TeamActivitySummaryCards from "@/components/activity/TeamActivitySummaryCards";
import TeamActivityTable from "@/components/activity/TeamActivityTable";
import { hasAnyPermission } from "@/lib/permissions";
import { getTeamActivity, getTeamMonitoringPolicy } from "@/lib/activity/managerClient";
import { currentPageSummary, formatDateTime, todayUtc } from "@/lib/activity/teamFormatters";
import { filterLoadedTeamRows, mergeTeamPages } from "@/lib/activity/teamStatus";

const TEAM_PERMISSIONS = ["activity.view_team", "activity.view_all"];
const initialFilters = () => ({ search: "", status: "", date: todayUtc(), deviceStatus: "", sort: "name" });

export default function ManagerTeamActivityPage() {
  const access = useAccess();
  const permitted = Boolean(access?.isOwner || hasAnyPermission(access, TEAM_PERMISSIONS));
  const [filters, setFilters] = useState(initialFilters);
  const [rows, setRows] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const load = useCallback(async ({ append = false, cursor = "" } = {}) => {
    if (!permitted || inFlight.current) return;
    inFlight.current = true;
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      const [teamResult, policyResult] = await Promise.allSettled([
        getTeamActivity({
          status: filters.status,
          date: filters.date,
          sort: filters.sort,
          cursor,
          limit: 25
        }),
        getTeamMonitoringPolicy()
      ]);
      if (!mounted.current) return;
      if (teamResult.status === "rejected") throw teamResult.reason;
      setRows(current => append ? mergeTeamPages(current, teamResult.value.employees) : teamResult.value.employees);
      setNextCursor(teamResult.value.pagination?.nextCursor || null);
      if (policyResult.status === "fulfilled") setPolicy(policyResult.value);
      else if (policyResult.reason?.code === "POLICY_NOT_CONFIGURED") setPolicy(null);
      else setError(policyResult.reason);
      setLastRefreshed(new Date());
      if (teamResult.status === "fulfilled" && policyResult.status === "fulfilled") setError(null);
    } catch (requestError) {
      if (mounted.current) {
        setError(requestError);
        if (requestError?.status === 403) {
          setRows([]);
          setSelectedId(null);
        }
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
        setLoadingMore(false);
      }
      inFlight.current = false;
    }
  }, [filters.date, filters.sort, filters.status, permitted]);

  useEffect(() => {
    mounted.current = true;
    if (permitted) load();
    return () => { mounted.current = false; };
  }, [filters.deviceStatus, filters.search, load, permitted]);

  useEffect(() => {
    if (!permitted) return undefined;
    const intervalMs = Math.max(30000, Math.min(60000, (policy?.heartbeatIntervalSeconds || 45) * 1000));
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [load, permitted, policy?.heartbeatIntervalSeconds]);

  const visibleRows = useMemo(() => filterLoadedTeamRows(rows, filters), [filters, rows]);
  const summary = useMemo(() => currentPageSummary(visibleRows), [visibleRows]);
  const selectedEmployee = rows.find(row => row.employeeId === selectedId) || null;
  const hasFilters = Boolean(filters.search || filters.status || filters.deviceStatus || filters.date !== todayUtc() || filters.sort !== "name");

  const updateFilters = useCallback(patch => {
    setNextCursor(null);
    setFilters(current => ({ ...current, ...patch }));
  }, []);

  const resetFilters = useCallback(() => {
    setNextCursor(null);
    setFilters(initialFilters());
  }, []);

  if (!permitted) return <section className="card p-10 text-center"><h1 className="text-xl font-bold">Module not available</h1><p className="mt-2 text-slate-500">Your assigned role does not include permission for this module.</p></section>;

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Management workspace</p><h1 className="mt-1 text-3xl font-extrabold">Team Activity</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">View live work-session status, active and idle time, devices, and recent activity for employees you supervise.</p></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">Last refreshed {lastRefreshed ? formatDateTime(lastRefreshed) : "never"}</span><button type="button" disabled={loading} onClick={() => load()} className="btn-secondary"><RefreshCw className="h-4 w-4" />Refresh</button></div></header>
    {!policy?.trackingEnabled && <div className="rounded-2xl border border-slate-200 bg-slate-100 p-4 text-sm text-slate-700"><strong>Monitoring disabled or unavailable.</strong> Existing authorised records remain visible, but no new tracking should be expected.</div>}
    {error && <TeamActivityErrorState error={error} onRetry={() => load()} />}
    {loading && !rows.length ? <TeamActivityLoadingState /> : <>
      <TeamActivitySummaryCards summary={summary} />
      <TeamActivityFilters filters={filters} disabled={loading || loadingMore} onChange={updateFilters} onReset={resetFilters} />
      <TeamActivityTable rows={visibleRows} hasFilters={hasFilters} nextCursor={nextCursor} loadingMore={loading || loadingMore} onLoadMore={() => load({ append: true, cursor: nextCursor })} onSelect={row => setSelectedId(row.employeeId)} />
    </>}
    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-900"><strong>About Activity level</strong><p className="mt-1">Activity level is based on recorded keyboard and mouse activity counts during a work session. It should not be interpreted as a complete measure of productivity or work quality.</p></section>
    {selectedEmployee && <TeamActivityEmployeeDrawer employee={selectedEmployee} policy={policy} onClose={() => setSelectedId(null)} />}
  </div>;
}
