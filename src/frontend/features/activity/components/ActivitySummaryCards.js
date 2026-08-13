import { Activity, Clock3, Moon, TimerOff, Zap } from "lucide-react";
import { formatDuration, formatPercentage } from "@/frontend/features/activity/utils/formatters";

const definitions = [
  ["Tracked time today", "trackedSeconds", Clock3, formatDuration],
  ["Active time today", "activeSeconds", Zap, formatDuration],
  ["Idle time today", "idleSeconds", Moon, formatDuration],
  ["Offline time today", "offlineSeconds", TimerOff, formatDuration],
  ["Activity level", "activityPercentage", Activity, formatPercentage]
];

export default function ActivitySummaryCards({ summary }) {
  return <section>
    <div className="mb-4"><h2 className="text-base font-extrabold text-slate-950">Today’s summary</h2><p className="mt-1 text-sm text-slate-500">Authoritative totals returned by FieldFlow.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {definitions.map(([label, key, Icon, formatter]) => <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={key}>
        <div className="flex items-center gap-2 text-slate-500"><span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-50 text-violet-600"><Icon className="h-4 w-4" /></span><span className="text-[10px] font-bold uppercase tracking-wide">{label}</span></div>
        <strong className="mt-3 block text-2xl tracking-tight text-slate-950">{formatter(summary?.[key] || 0)}</strong>
      </article>)}
    </div>
    <p className="mt-3 text-xs text-slate-500">Activity level is based on recorded input activity and should not be interpreted as a complete measure of productivity.</p>
  </section>;
}
