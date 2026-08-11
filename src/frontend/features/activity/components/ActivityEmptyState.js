import { CircleDashed } from "lucide-react";

export default function ActivityEmptyState({ title, description }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
    <CircleDashed className="mx-auto h-7 w-7 text-slate-400" />
    <h3 className="mt-3 font-semibold text-slate-800">{title}</h3>
    <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">{description}</p>
  </div>;
}
