import { Activity, Clock3, Moon, TimerOff, Zap } from "lucide-react";
import { formatDuration, formatPercentage } from "@/lib/activity/formatters";

const definitions = [
  ["Tracked time today", "trackedSeconds", Clock3, formatDuration],
  ["Active time today", "activeSeconds", Zap, formatDuration],
  ["Idle time today", "idleSeconds", Moon, formatDuration],
  ["Offline time today", "offlineSeconds", TimerOff, formatDuration],
  ["Activity level", "activityPercentage", Activity, formatPercentage]
];

export default function ActivitySummaryCards({ summary }) {
  return <section>
    <div className="mb-4"><h2 className="text-lg font-bold">Today’s summary</h2><p className="text-sm text-slate-500">Authoritative totals returned by FieldFlow.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {definitions.map(([label, key, Icon, formatter]) => <article className="card p-5" key={key}>
        <div className="flex items-center gap-2 text-slate-500"><Icon className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wide">{label}</span></div>
        <strong className="mt-3 block text-2xl">{formatter(summary?.[key] || 0)}</strong>
      </article>)}
    </div>
    <p className="mt-3 text-xs text-slate-500">Activity level is based on recorded input activity and should not be interpreted as a complete measure of productivity.</p>
  </section>;
}
