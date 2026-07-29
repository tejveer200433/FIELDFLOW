import { AlertTriangle } from "lucide-react";

export default function MonitoringSettingsWarning({ policy }) {
  if (policy?.trackingEnabled) return <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900"><strong>Monitoring is enabled.</strong><p className="mt-1 text-sm">Employees may start explicit tracking sessions after satisfying device and acknowledgement requirements.</p></section>;
  return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0" /><div><strong>Monitoring is currently disabled.</strong><p className="mt-1 text-sm">Employees cannot start new tracking sessions.</p></div></div></section>;
}
