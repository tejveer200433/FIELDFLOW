import { Eye } from "lucide-react";
import TeamActivityDeviceStatus from "@/components/activity/TeamActivityDeviceStatus";
import TeamActivityEmptyState from "@/components/activity/TeamActivityEmptyState";
import TeamActivityStatusBadge from "@/components/activity/TeamActivityStatusBadge";
import { formatDuration, formatPercentage, formatRelativeTime, shortIdentifier } from "@/lib/activity/teamFormatters";
import { effectiveDeviceStatus } from "@/lib/activity/teamStatus";

function SessionLabel({ row }) {
  if (!row.activeSessionId) return <span className="text-slate-400">None</span>;
  return <span title={row.activeSessionId} className="font-medium">Active · {shortIdentifier(row.activeSessionId)}</span>;
}

export default function TeamActivityTable({ rows, hasFilters, nextCursor, loadingMore, onLoadMore, onSelect }) {
  if (!rows.length) return <section className="card p-5"><TeamActivityEmptyState filtered={hasFilters} /></section>;
  return <section className="card overflow-hidden">
    <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1180px] text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-4">Employee</th><th className="p-4">Status</th><th className="p-4">Current session</th><th className="p-4">Project / task</th><th className="p-4">Application</th><th className="p-4">Tracked / active / idle</th><th className="p-4">Activity level</th><th className="p-4">Device</th><th className="p-4">Last update</th><th className="p-4"><span className="sr-only">Action</span></th></tr></thead>
      <tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.employeeId} className="hover:bg-slate-50/70"><td className="p-4 font-semibold">{row.employeeName}</td><td className="p-4"><TeamActivityStatusBadge status={row.currentStatus} /></td><td className="p-4"><SessionLabel row={row} /></td><td className="p-4 text-slate-500">Not provided</td><td className="max-w-44 truncate p-4" title={row.activeApplication || ""}>{row.activeApplication || "Not collected"}</td><td className="p-4 text-xs leading-5 text-slate-600">{formatDuration(row.trackedSecondsToday)} / {formatDuration(row.activeSecondsToday)} / {formatDuration(row.idleSecondsToday)}</td><td className="p-4 font-semibold">{formatPercentage(row.activityPercentage)}</td><td className="p-4"><TeamActivityDeviceStatus status={effectiveDeviceStatus(row)} lastSeenAt={row.lastSeenAt} /></td><td className="p-4 text-slate-500">{formatRelativeTime(row.lastSeenAt)}</td><td className="p-4"><button type="button" onClick={() => onSelect(row)} className="btn-secondary px-3"><Eye className="h-4 w-4" />View</button></td></tr>)}</tbody>
    </table></div>
    <div className="divide-y divide-slate-100 md:hidden">{rows.map(row => <article key={row.employeeId} className="p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{row.employeeName}</h3><div className="mt-2"><TeamActivityStatusBadge status={row.currentStatus} /></div></div><button aria-label={`View ${row.employeeName}`} type="button" onClick={() => onSelect(row)} className="icon-button h-10 w-10"><Eye className="h-4 w-4" /></button></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Session</dt><dd className="mt-1"><SessionLabel row={row} /></dd></div><div><dt className="text-xs text-slate-500">Device</dt><dd className="mt-1"><TeamActivityDeviceStatus status={effectiveDeviceStatus(row)} lastSeenAt={row.lastSeenAt} /></dd></div><div><dt className="text-xs text-slate-500">Tracked today</dt><dd className="mt-1 font-semibold">{formatDuration(row.trackedSecondsToday)}</dd></div><div><dt className="text-xs text-slate-500">Activity level</dt><dd className="mt-1 font-semibold">{formatPercentage(row.activityPercentage)}</dd></div><div className="col-span-2"><dt className="text-xs text-slate-500">Current application</dt><dd className="mt-1 truncate">{row.activeApplication || "Not collected"}</dd></div></dl></article>)}</div>
    {nextCursor && <div className="border-t border-slate-100 p-4 text-center"><button type="button" disabled={loadingMore} onClick={onLoadMore} className="btn-secondary">{loadingMore ? "Loading…" : "Load more authorised employees"}</button></div>}
  </section>;
}
