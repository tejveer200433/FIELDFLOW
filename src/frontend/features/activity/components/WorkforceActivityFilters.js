"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Search } from "lucide-react";

export default function WorkforceActivityFilters({ filters, onChange, onReset, disabled }) {
  const [search, setSearch] = useState(filters.search);
  useEffect(() => setSearch(filters.search), [filters.search]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search !== filters.search) onChange({ search });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [filters.search, onChange, search]);
  return <section className="card p-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <label className="relative"><span className="sr-only">Employee search</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-10" value={search} disabled={disabled} onChange={event => setSearch(event.target.value)} placeholder="Search loaded workforce…" /></label>
    <select aria-label="Activity status" className="input" value={filters.status} disabled={disabled} onChange={event => onChange({ status: event.target.value })}><option value="">All statuses</option><option value="active">Active</option><option value="idle">Idle</option><option value="offline">Offline</option><option value="unreachable">Unreachable</option><option value="not_tracking">Not tracking</option></select>
    <input aria-label="Summary date" type="date" className="input" value={filters.date} disabled={disabled} onChange={event => onChange({ date: event.target.value })} />
    <select aria-label="Device status" className="input" value={filters.deviceStatus} disabled={disabled} onChange={event => onChange({ deviceStatus: event.target.value })}><option value="">All devices</option><option value="active">Active</option><option value="pending">Pending</option><option value="revoked">Revoked</option><option value="offline">Offline</option></select>
    <input aria-label="Department filter" className="input" value={filters.department} disabled={disabled} onChange={event => onChange({ department: event.target.value.slice(0, 80) })} placeholder="Department (loaded page)" />
    <input aria-label="Agent version filter" className="input" value={filters.agentVersion} disabled={disabled} onChange={event => onChange({ agentVersion: event.target.value.slice(0, 80) })} placeholder="Agent version (device page)" />
    <select aria-label="Sort order" className="input" value={filters.sort} disabled={disabled} onChange={event => onChange({ sort: event.target.value })}><option value="name">Name</option><option value="last_seen">Last update</option><option value="activity">Activity level</option></select>
    <button type="button" onClick={onReset} disabled={disabled} className="btn-secondary"><RotateCcw className="h-4 w-4" />Reset filters</button>
  </div><p className="mt-3 text-xs text-slate-500">Team filtering is unavailable in Phase 2. Search, department, device, and agent filters apply only to loaded server-authorised pages.</p></section>;
}
