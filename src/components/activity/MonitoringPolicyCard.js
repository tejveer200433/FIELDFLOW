import { ClipboardCheck } from "lucide-react";
import { formatInterval } from "@/lib/activity/formatters";
import ActivityEmptyState from "@/components/activity/ActivityEmptyState";

export default function MonitoringPolicyCard({ policy }) {
  if (!policy) return <section className="card p-5"><ActivityEmptyState title="No monitoring policy" description="Your organisation has not made a monitoring policy available." /></section>;
  const details = [
    ["Policy version", policy.policyVersion],
    ["Tracking", policy.trackingEnabled ? "Enabled" : "Disabled"],
    ["Idle threshold", formatInterval(policy.idleThresholdSeconds)],
    ["Sampling interval", formatInterval(policy.sampleIntervalSeconds)],
    ["Upload interval", formatInterval(policy.uploadIntervalSeconds)],
    ["Heartbeat interval", formatInterval(policy.heartbeatIntervalSeconds)],
    ["Application names", policy.collectApplicationNames ? "Collected" : "Not collected"],
    ["Retention", `${policy.retentionDays} days`],
    ["Acknowledgement", policy.requireAcknowledgement ? "Required" : "Not required"]
  ];
  return <section className="card p-5 sm:p-6">
    <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-blue-600"><ClipboardCheck className="h-5 w-5" /></span><div><h2 className="font-bold">Monitoring policy</h2><p className="text-sm text-slate-500">The active settings that govern activity tracking.</p></div></div>
    <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {details.map(([label, value]) => <div key={label} className="border-b border-slate-100 pb-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{value}</dd></div>)}
    </dl>
  </section>;
}
