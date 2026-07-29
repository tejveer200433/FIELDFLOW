import { Activity, CircleAlert, CircleCheck, CloudOff, ShieldAlert } from "lucide-react";

const tones = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  rose: "border-rose-200 bg-rose-50 text-rose-800",
  slate: "border-slate-200 bg-slate-100 text-slate-700"
};

const icons = {
  active: Activity,
  ready: CircleCheck,
  acknowledgement: ShieldAlert,
  offline: CloudOff,
  error: CircleAlert
};

export default function ActivityStatusCard({ status, description }) {
  const Icon = icons[status.key] || CircleAlert;
  return <section aria-live="polite" className={`rounded-2xl border p-5 ${tones[status.tone] || tones.slate}`}>
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/70"><Icon className="h-5 w-5" /></span>
      <div><h2 className="font-bold">{status.label}</h2><p className="mt-1 text-sm opacity-80">{description}</p></div>
    </div>
  </section>;
}
