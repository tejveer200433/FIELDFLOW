"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ScrollText } from "lucide-react";
import AdminActivityEmptyState from "@/frontend/features/activity/components/AdminActivityEmptyState";
import { getMonitoringAuditLog } from "@/frontend/features/activity/api/adminClient";
import { formatDateTime } from "@/frontend/features/activity/utils/adminFormatters";

function eventLabel(value) {
  return String(value || "Monitoring event").replace(/[._-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export default function MonitoringAuditLog({ title = "Monitoring audit log" }) {
  const [events, setEvents] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async ({ append = false, nextCursor = "" } = {}) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError("");
    try {
      const result = await getMonitoringAuditLog({ cursor: nextCursor, limit: 25 });
      setEvents(current => append ? [...current, ...result.events] : result.events);
      setCursor(result.pagination?.nextCursor || null);
    } catch (requestError) {
      setError(requestError.message || "Monitoring audit history could not be loaded.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return <section className="card p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3"><ScrollText className="mt-0.5 h-5 w-5 text-blue-600" /><div><h2 className="font-bold">{title}</h2><p className="mt-1 text-sm text-slate-500">Permission-scoped policy, device, session, and monitoring events. Sensitive metadata is never returned.</p></div></div>
      <button type="button" onClick={() => load()} disabled={loading} className="btn-secondary"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button>
    </div>
    {error && <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><span>{error}</span><button type="button" onClick={() => load()} className="font-bold underline">Try again</button></div>}
    {loading && !events.length && <div className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Loading audit history…</div>}
    {!loading && !error && !events.length && <div className="mt-4"><AdminActivityEmptyState title="No monitoring events yet" description="Policy, device, session, and other administrative monitoring changes will appear here." /></div>}
    {events.length > 0 && <div className="mt-4 divide-y rounded-xl border border-slate-200">
      {events.map(event => <article key={event.id} className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0"><p className="font-semibold text-slate-900">{eventLabel(event.action)}</p><p className="mt-1 text-xs text-slate-500">{event.actorName}{event.employeeName ? ` · Employee: ${event.employeeName}` : ""} · {eventLabel(event.entityType)}</p></div>
        <time className="text-xs text-slate-400" dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
      </article>)}
    </div>}
    {cursor && <button type="button" disabled={loadingMore} onClick={() => load({ append: true, nextCursor: cursor })} className="btn-secondary mt-4 w-full">{loadingMore ? "Loading…" : "Load older events"}</button>}
  </section>;
}
