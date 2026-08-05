import { Code2 } from "lucide-react";
import { formatDuration } from "@/lib/activity/formatters";
import ActivityEmptyState from "@/components/activity/ActivityEmptyState";

const IDE_LABELS = { vscode: "VS Code", cursor: "Cursor", intellij: "IntelliJ IDEA", eclipse: "Eclipse" };

export default function CodingActivitySummary({ enabled = false, usage = [] }) {
  return <section className="card p-5 sm:p-6">
    <div className="flex items-center gap-3"><Code2 className="h-5 w-5 text-blue-600" /><div><h2 className="font-bold">Coding activity</h2><p className="text-sm text-slate-500">Which IDE and project were active, reported by the desktop agent.</p></div></div>
    {!enabled
      ? <div className="mt-5"><ActivityEmptyState title="Not collected" description="Your organisation has not enabled coding-project collection." /></div>
      : !usage.length
        ? <div className="mt-5"><ActivityEmptyState title="No coding activity yet" description="Open a supported IDE (VS Code, Cursor, IntelliJ, or Eclipse) during a tracking session." /></div>
        : <div className="mt-5 space-y-3">{usage.map(item =>
          <div className="flex items-center justify-between gap-3 text-sm" key={`${item.ideName}:${item.projectName}`}>
            <span className="truncate"><strong>{item.projectName}</strong><span className="ml-2 text-slate-500">{IDE_LABELS[item.ideName] || item.ideName}</span></span>
            <span className="shrink-0 text-slate-500">{formatDuration(item.durationSeconds)}</span>
          </div>)}</div>}
    <p className="mt-4 text-xs text-slate-500">Window titles, open file names, and file paths are never collected -- only the IDE and a parsed project name.</p>
  </section>;
}
