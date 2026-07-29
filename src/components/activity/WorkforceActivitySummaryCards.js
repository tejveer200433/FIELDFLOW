import { Activity, Clock3, Laptop, Moon, TimerOff, UserX, WifiOff } from "lucide-react";
import { formatDuration } from "@/lib/activity/adminFormatters";

const items = [
  ["Active now", "active", Activity, value => value],
  ["Idle now", "idle", Moon, value => value],
  ["Offline", "offline", WifiOff, value => value],
  ["Not tracking", "notTracking", TimerOff, value => value],
  ["Registered devices", "registeredDevices", Laptop, value => value],
  ["Revoked devices", "revokedDevices", UserX, value => value],
  ["Tracked today", "trackedSeconds", Clock3, formatDuration]
];

export default function WorkforceActivitySummaryCards({ summary }) {
  return <section><h2 className="text-lg font-bold">Loaded workforce summary</h2><p className="text-sm text-slate-500">These values describe the currently loaded authorised pages and are not organisation-wide authoritative totals.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">{items.map(([label, key, Icon, format]) => <article className="card p-4" key={key}><div className="flex items-center gap-2 text-slate-500"><Icon className="h-4 w-4" /><span className="text-[11px] font-bold uppercase tracking-wide">{label}</span></div><strong className="mt-3 block text-xl">{format(summary[key] || 0)}</strong></article>)}</div></section>;
}
