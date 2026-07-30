import { Globe2 } from "lucide-react";
import { formatDuration } from "@/lib/activity/formatters";
import ActivityEmptyState from "@/components/activity/ActivityEmptyState";

export default function WebsiteUsageSummary({ usage = [] }) {
  return <section className="card p-5 sm:p-6">
    <div className="flex items-center gap-3"><Globe2 className="h-5 w-5 text-blue-600" /><div><h2 className="font-bold">Website usage</h2><p className="text-sm text-slate-500">Active hostname time reported by the managed browser extension.</p></div></div>
    {!usage.length
      ? <div className="mt-5"><ActivityEmptyState title="No website data" description="Install and sign in to the FieldFlow browser extension to collect domain-only usage." /></div>
      : <div className="mt-5 space-y-3">{usage.map(item =>
        <div className="flex items-center justify-between gap-3 text-sm" key={item.domain}>
          <strong className="truncate">{item.domain}</strong><span className="shrink-0 text-slate-500">{formatDuration(item.durationSeconds)}</span>
        </div>)}</div>}
    <p className="mt-4 text-xs text-slate-500">Full URLs, page paths, searches, page titles, and page content are not collected.</p>
  </section>;
}
