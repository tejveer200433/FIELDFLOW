const styles = {
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  red: "border-rose-200 bg-rose-50 text-rose-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  slate: "border-slate-200 bg-slate-100 text-slate-600",
  violet: "border-violet-200 bg-violet-50 text-violet-700"
};

export function toneFor(value) {
  if (["On Duty", "Task Completed", "Completed", "Approved", "On time"].includes(value)) return "green";
  if (["Blocked", "Urgent", "Rejected"].includes(value)) return "red";
  if (["On Break", "High", "Late", "Needs Update", "Pending"].includes(value)) return "amber";
  if (["Offline", "Low", "Assigned"].includes(value)) return "slate";
  if (value === "On The Way") return "violet";
  return "blue";
}

export default function StatusPill({ children, tone = "blue" }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${styles[tone] || styles.blue}`}>
    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
    {children}
  </span>;
}
