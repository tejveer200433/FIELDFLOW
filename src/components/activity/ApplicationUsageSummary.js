import { AppWindow } from "lucide-react";
import { formatDuration, formatPercentage } from "@/lib/activity/formatters";
import ActivityEmptyState from "@/components/activity/ActivityEmptyState";

export default function ApplicationUsageSummary({ enabled, usage, sampleIntervalSeconds, trackedSeconds }) {
  if (!enabled) return <section className="card p-5 sm:p-6"><ActivityEmptyState title="Application usage unavailable" description="Application-name collection is disabled by your organisation." /></section>;
  return <section className="card p-5 sm:p-6">
    <div className="flex items-center gap-3"><AppWindow className="h-5 w-5 text-blue-600" /><div><h2 className="font-bold">Application usage summary</h2><p className="text-sm text-slate-500">Approximate time based on grouped activity samples.</p></div></div>
    {!usage.length
      ? <div className="mt-5"><ActivityEmptyState title="No application data" description="Application summaries will appear after activity samples are uploaded." /></div>
      : <div className="mt-5 space-y-4">{usage.map(item => {
        const seconds = item.sampleCount * (sampleIntervalSeconds || 0);
        const percentage = trackedSeconds ? seconds / trackedSeconds * 100 : 0;
        return <div key={item.application}><div className="flex items-center justify-between gap-3 text-sm"><strong className="truncate">{item.application}</strong><span className="shrink-0 text-slate-500">{formatDuration(seconds)} · {formatPercentage(percentage)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, percentage)}%` }} /></div></div>;
      })}</div>}
    <p className="mt-4 text-xs text-slate-500">Only application names are shown. Window titles, URLs, document names, and file paths are not displayed or collected by this feature.</p>
  </section>;
}
