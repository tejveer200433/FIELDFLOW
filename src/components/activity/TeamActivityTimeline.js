import { Clock3 } from "lucide-react";
import { formatDateTime, formatDuration } from "@/lib/activity/teamFormatters";
import ActivityEmptyState from "@/components/activity/ActivityEmptyState";

export default function TeamActivityTimeline({ sessions }) {
  if (!sessions?.length) return <ActivityEmptyState title="No timeline records" description="Tracking sessions in the selected period will appear here." />;
  return <ol className="space-y-3">{sessions.map(session => {
    const duration = session.endedAt ? Math.max(0, Math.floor((new Date(session.endedAt) - new Date(session.startedAt)) / 1000)) : null;
    return <li key={session.sessionId} className="flex gap-3 rounded-xl bg-slate-50 p-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-blue-600"><Clock3 className="h-4 w-4" /></span><div><h4 className="font-semibold">{session.endedAt ? "Tracking stopped" : "Tracking active"}</h4><p className="mt-1 text-sm text-slate-500">{formatDateTime(session.startedAt)}{session.endedAt ? ` – ${formatDateTime(session.endedAt)}` : ""}</p>{duration !== null && <p className="mt-1 text-xs text-slate-500">{formatDuration(duration)}</p>}</div></li>;
  })}</ol>;
}
