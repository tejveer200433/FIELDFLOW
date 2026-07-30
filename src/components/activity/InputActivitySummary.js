import { Keyboard, MousePointer2 } from "lucide-react";
import { formatDateTime } from "@/lib/activity/formatters";

const numberFormatter = new Intl.NumberFormat();

export default function InputActivitySummary({ activity }) {
  const keyboardEvents = Number(activity?.keyboardEventCount) || 0;
  const mouseEvents = Number(activity?.mouseEventCount) || 0;

  return <section>
    <div className="mb-4">
      <h2 className="text-lg font-bold">Today&apos;s input activity</h2>
      <p className="text-sm text-slate-500">Aggregate event counts only; typed keys and mouse coordinates are never collected.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <article className="card p-5">
        <div className="flex items-center gap-2 text-slate-500"><Keyboard className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wide">Keyboard events</span></div>
        <strong className="mt-3 block text-2xl">{numberFormatter.format(keyboardEvents)}</strong>
      </article>
      <article className="card p-5">
        <div className="flex items-center gap-2 text-slate-500"><MousePointer2 className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-wide">Mouse events</span></div>
        <strong className="mt-3 block text-2xl">{numberFormatter.format(mouseEvents)}</strong>
      </article>
    </div>
    <p className="mt-3 text-xs text-slate-500">
      {activity?.lastSampleAt
        ? `Last input sample received ${formatDateTime(activity.lastSampleAt)}.`
        : "No input samples have been received today."}
    </p>
  </section>;
}
