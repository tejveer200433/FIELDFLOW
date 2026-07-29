"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAccess } from "@/components/AccessContext";
import AdminActivityErrorState from "@/components/activity/AdminActivityErrorState";
import AdminActivityLoadingState from "@/components/activity/AdminActivityLoadingState";
import WorkforceActivityFilters from "@/components/activity/WorkforceActivityFilters";
import WorkforceActivitySummaryCards from "@/components/activity/WorkforceActivitySummaryCards";
import WorkforceActivityTable from "@/components/activity/WorkforceActivityTable";
import WorkforceAuditPanel from "@/components/activity/WorkforceAuditPanel";
import WorkforceDevicePanel from "@/components/activity/WorkforceDevicePanel";
import WorkforceEmployeeDrawer from "@/components/activity/WorkforceEmployeeDrawer";
import { hasPermission } from "@/lib/permissions";
import { getWorkforceActivity, getWorkforceDevices } from "@/lib/activity/adminClient";
import { getTeamMonitoringPolicy } from "@/lib/activity/managerClient";
import { currentPageSummary, formatDateTime, todayUtc } from "@/lib/activity/teamFormatters";
import { effectiveDeviceStatus, mergeTeamPages } from "@/lib/activity/teamStatus";

const initialFilters = () => ({ search: "", status: "", date: todayUtc(), department: "", deviceStatus: "", agentVersion: "", sort: "name" });

export default function AdminWorkforceActivityPage() {
  const access = useAccess();
  const permitted = Boolean(access?.isOwner || hasPermission(access, "activity.view_all"));
  const [filters, setFilters] = useState(initialFilters);
  const [rows, setRows] = useState([]);
  const [devices, setDevices] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [deviceCursor, setDeviceCursor] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState("");
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const load = useCallback(async ({ append = false, cursor = "" } = {}) => {
    if (!permitted || inFlight.current) return;
    inFlight.current = true;
    if (append) setLoadingMore("workforce"); else setLoading(true);
    setError(null);
    try {
      const [workforce, devicePage, policyResult] = await Promise.all([
        getWorkforceActivity({ status: filters.status, date: filters.date, sort: filters.sort, search: filters.search, cursor, limit: 25 }),
        getWorkforceDevices({ limit: 50 }),
        getTeamMonitoringPolicy().catch(requestError => requestError)
      ]);
      if (!mounted.current) return;
      const deviceByEmployee = new Map(devicePage.devices.map(device => [device.employeeId, device]));
      const enriched = workforce.employees.map(employee => {
        const device = deviceByEmployee.get(employee.employeeId);
        return { ...employee, agentVersion: device?.agentVersion || null, deviceStatus: device?.status || employee.deviceStatus };
      });
      setRows(current => append ? mergeTeamPages(current, enriched) : enriched);
      setNextCursor(workforce.pagination?.nextCursor || null);
      if (!append) {
        setDevices(devicePage.devices);
        setDeviceCursor(devicePage.pagination?.nextCursor || null);
      }
      if (policyResult instanceof Error) {
        if (policyResult.code === "POLICY_NOT_CONFIGURED") setPolicy(null);
        else setError(policyResult);
      } else setPolicy(policyResult);
      setLastRefreshed(new Date());
    } catch (requestError) {
      if (mounted.current) {
        setError(requestError);
        if (requestError?.status === 403) {
          setRows([]);
          setSelectedId(null);
        }
      }
    } finally {
      if (mounted.current) { setLoading(false); setLoadingMore(""); }
      inFlight.current = false;
    }
  }, [filters.date, filters.search, filters.sort, filters.status, permitted]);

  useEffect(() => {
    mounted.current = true;
    if (permitted) load();
    return () => { mounted.current = false; };
  }, [filters.agentVersion, filters.department, filters.deviceStatus, load, permitted]);

  useEffect(() => {
    if (!permitted) return undefined;
    const intervalMs = Math.max(30000, Math.min(60000, (policy?.heartbeatIntervalSeconds || 45) * 1000));
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, intervalMs);
    return () => window.clearInterval(timer);
  }, [load, permitted, policy?.heartbeatIntervalSeconds]);

  const visibleRows = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const department = filters.department.trim().toLowerCase();
    const agent = filters.agentVersion.trim().toLowerCase();
    return rows.filter(row => {
      if (search && !`${row.employeeName || ""} ${row.email || ""}`.toLowerCase().includes(search)) return false;
      if (filters.deviceStatus && effectiveDeviceStatus(row) !== filters.deviceStatus) return false;
      if (department && !String(row.department || "").toLowerCase().includes(department)) return false;
      if (agent && !String(row.agentVersion || "").toLowerCase().includes(agent)) return false;
      return true;
    });
  }, [filters.agentVersion, filters.department, filters.deviceStatus, filters.search, rows]);
  const summary = useMemo(() => {
    const base = currentPageSummary(visibleRows);
    return {
      ...base,
      registeredDevices: devices.length,
      revokedDevices: devices.filter(device => device.status === "revoked").length
    };
  }, [devices, visibleRows]);
  const selectedEmployee = rows.find(row => row.employeeId === selectedId) || null;
  const filtered = Object.entries(filters).some(([key, value]) => value && !(key === "date" && value === todayUtc()) && !(key === "sort" && value === "name"));

  const updateFilters = useCallback(patch => {
    setNextCursor(null);
    setFilters(current => ({ ...current, ...patch }));
  }, []);
  const resetFilters = useCallback(() => {
    setNextCursor(null);
    setFilters(initialFilters());
  }, []);
  async function loadMoreDevices() {
    if (!deviceCursor || inFlight.current) return;
    inFlight.current = true;
    setLoadingMore("devices");
    try {
      const page = await getWorkforceDevices({ cursor: deviceCursor, limit: 50 });
      if (!mounted.current) return;
      const merged = new Map(devices.map(device => [device.deviceId, device]));
      for (const device of page.devices) merged.set(device.deviceId, device);
      setDevices(Array.from(merged.values()));
      setDeviceCursor(page.pagination?.nextCursor || null);
    } catch (requestError) {
      if (mounted.current) setError(requestError);
    } finally {
      if (mounted.current) setLoadingMore("");
      inFlight.current = false;
    }
  }

  if (!permitted) return <section className="card p-10 text-center"><h1 className="text-xl font-bold">Module not available</h1><p className="mt-2 text-slate-500">Your assigned role does not include permission for this module.</p></section>;
  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Administration</p><h1 className="mt-1 text-3xl font-extrabold">Workforce Activity</h1><p className="mt-2 text-sm text-slate-500">View live monitoring status, work sessions, devices, and activity summaries across the organisation.</p></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">Last refreshed {lastRefreshed ? formatDateTime(lastRefreshed) : "never"}</span><button type="button" disabled={loading} onClick={() => load()} className="btn-secondary"><RefreshCw className="h-4 w-4" />Refresh</button></div></header>
    {!policy?.trackingEnabled && <div className="rounded-2xl border border-slate-200 bg-slate-100 p-4 text-sm"><strong>Monitoring disabled or unavailable.</strong> Historical authorised records remain visible.</div>}
    {error && <AdminActivityErrorState error={error} onRetry={() => load()} />}
    {loading && !rows.length ? <AdminActivityLoadingState label="Loading workforce activity…" /> : <>
      <WorkforceActivitySummaryCards summary={summary} />
      <WorkforceActivityFilters filters={filters} onChange={updateFilters} onReset={resetFilters} disabled={loading || Boolean(loadingMore)} />
      <WorkforceActivityTable rows={visibleRows} filtered={filtered} nextCursor={nextCursor} loadingMore={loadingMore === "workforce"} onLoadMore={() => load({ append: true, cursor: nextCursor })} onSelect={row => setSelectedId(row.employeeId)} />
    </>}
    <div className="grid gap-6 xl:grid-cols-2"><WorkforceDevicePanel devices={devices} nextCursor={deviceCursor} loadingMore={loadingMore === "devices"} onLoadMore={loadMoreDevices} /><WorkforceAuditPanel /></div>
    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-900"><strong>About Activity level</strong><p className="mt-1">Activity level is based on recorded keyboard and mouse activity counts during an active work session. It should not be interpreted as a complete measure of productivity, performance, or work quality.</p></section>
    {selectedEmployee && <WorkforceEmployeeDrawer employee={selectedEmployee} policy={policy} onClose={() => setSelectedId(null)} />}
  </div>;
}
