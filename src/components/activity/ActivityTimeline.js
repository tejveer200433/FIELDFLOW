import { Clock3 } from "lucide-react";
import { formatDateTime, formatDuration } from "@/lib/activity/formatters";
import ActivityEmptyState from "@/components/activity/ActivityEmptyState";

export default function ActivityTimeline({ sessions, rangeDays, onRangeChange }) {
  return <section className="card p-5 sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="font-bold">Recent activity history</h2><p className="mt-1 text-sm text-slate-500">Work sessions grouped into readable time blocks.</p></div>
      <select aria-label="Activity history range" className="input w-full sm:w-auto" value={rangeDays} onChange={event => onRangeChange(Number(event.target.value))}>
        <option value={1}>Today</option><option value={2}>Today and yesterday</option><option value={7}>Last 7 days</option>
      </select>
    </div>
    {!sessions.length
      ? <div className="mt-5"><ActivityEmptyState title="No activity in this period" description="Completed and active tracking sessions will appear here." /></div>
      : <ol className="mt-5 space-y-3">{sessions.map(session => {
        const seconds = session.endedAt ? Math.floor((new Date(session.endedAt) - new Date(session.startedAt)) / 1000) : null;
        return <li key={session.sessionId} className="flex gap-3 rounded-xl bg-slate-50 p-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-blue-600"><Clock3 className="h-4 w-4" /></span><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{session.endedAt ? "Tracking session completed" : "Tracking session active"}</h3>{seconds !== null && <span className="text-xs font-semibold text-slate-500">{formatDuration(seconds)}</span>}</div><p className="mt-1 text-sm text-slate-500">{formatDateTime(session.startedAt)}{session.endedAt ? ` – ${formatDateTime(session.endedAt)}` : ""}</p><p className="mt-1 text-xs text-slate-400">Started from {session.startSource || "unknown"}{session.endSource ? ` · stopped from ${session.endSource}` : ""}</p></div></li>;
      })}</ol>}
  </section>;
}
