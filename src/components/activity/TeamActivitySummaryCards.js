import { Activity, Clock3, Moon, TimerOff, WifiOff } from "lucide-react";
import { formatDuration } from "@/lib/activity/teamFormatters";

const definitions = [
  ["Active now", "active", Activity, value => value],
  ["Idle now", "idle", Moon, value => value],
  ["Offline", "offline", WifiOff, value => value],
  ["Not tracking", "notTracking", TimerOff, value => value],
  ["Tracked today", "trackedSeconds", Clock3, formatDuration]
];

export default function TeamActivitySummaryCards({ summary }) {
  return <section>
    <div className="flex items-end justify-between gap-3"><div><h2 className="text-lg font-bold">Loaded team summary</h2><p className="text-sm text-slate-500">Counts and time reflect the currently loaded authorised page, not an organisation-wide total.</p></div></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{definitions.map(([label, key, Icon, format]) => <article className="card p-5" key={key}><div className="flex items-center gap-2 text-slate-500"><Icon className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wide">{label}</span></div><strong className="mt-3 block text-2xl">{format(summary[key] || 0)}</strong></article>)}</div>
  </section>;
}
