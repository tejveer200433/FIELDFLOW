"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Search } from "lucide-react";

export default function TeamActivityFilters({ filters, onChange, onReset, disabled }) {
  const [search, setSearch] = useState(filters.search);

  useEffect(() => setSearch(filters.search), [filters.search]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search !== filters.search) onChange({ search });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [filters.search, onChange, search]);

  return <section className="card p-4 sm:p-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <label className="relative sm:col-span-2"><span className="sr-only">Search employees</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} disabled={disabled} onChange={event => setSearch(event.target.value)} className="input pl-10" placeholder="Search loaded employees…" /></label>
      <label><span className="sr-only">Status</span><select value={filters.status} disabled={disabled} onChange={event => onChange({ status: event.target.value })} className="input"><option value="">All statuses</option><option value="active">Active</option><option value="idle">Idle</option><option value="offline">Offline</option><option value="unreachable">Unreachable</option><option value="not_tracking">Not tracking</option></select></label>
      <label><span className="sr-only">Device status</span><select value={filters.deviceStatus} disabled={disabled} onChange={event => onChange({ deviceStatus: event.target.value })} className="input"><option value="">All devices</option><option value="active">Active device</option><option value="pending">Pending device</option><option value="revoked">Revoked device</option><option value="offline">Offline device</option></select></label>
      <label><span className="sr-only">Summary date</span><input type="date" value={filters.date} disabled={disabled} onChange={event => onChange({ date: event.target.value })} className="input" /></label>
      <label><span className="sr-only">Sort order</span><select value={filters.sort} disabled={disabled} onChange={event => onChange({ sort: event.target.value })} className="input"><option value="name">Name</option><option value="last_seen">Last update</option><option value="activity">Activity level</option></select></label>
    </div>
    <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Search and device filters apply to loaded, server-scoped employees. Status, date, sort, and pagination are enforced by the team API.</p><button type="button" disabled={disabled} onClick={onReset} className="btn-secondary shrink-0"><RotateCcw className="h-4 w-4" />Reset filters</button></div>
  </section>;
}
