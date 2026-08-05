import { statusLabel } from "@/lib/activity/teamFormatters";
import { statusTone } from "@/lib/activity/teamStatus";

const styles = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  slate: "border-slate-200 bg-slate-100 text-slate-600",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700"
};

export default function TeamActivityStatusBadge({ status }) {
  const tone = statusTone(status);
  return <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-bold ${styles[tone]}`}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" />{statusLabel(status)}
  </span>;
}
