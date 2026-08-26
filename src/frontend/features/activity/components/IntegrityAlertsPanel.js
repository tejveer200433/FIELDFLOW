"use client";

import { ShieldAlert } from "lucide-react";
import { formatDateTime } from "@/frontend/features/activity/utils/teamFormatters";

const labels = {
  clock_skew: "Device clock differs from server time",
  agent_binary_changed: "Agent executable changed"
};

export default function IntegrityAlertsPanel({ alerts, loading }) {
  if (!loading && !alerts.length) return null;
  return <section className="rounded-lg border border-amber-200 bg-amber-50 p-5" aria-live="polite">
    <div className="flex items-center gap-2 text-amber-950"><ShieldAlert className="h-5 w-5" /><h2 className="font-bold">Integrity alerts</h2></div>
    <p className="mt-1 text-sm text-amber-900">These are review signals from server-time and executable-digest checks. They are not conclusive proof of misconduct.</p>
    {loading ? <p className="mt-3 text-sm text-amber-900">Checking agent integrity...</p> : <ul className="mt-3 divide-y divide-amber-200 text-sm text-amber-950">
      {alerts.map(alert => <li key={alert.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
        <span><strong>{labels[alert.type] || alert.type}</strong><span className="ml-2 text-amber-800">Risk {alert.riskScore}/100</span></span>
        <time className="text-xs text-amber-800">{formatDateTime(alert.detectedAt)}</time>
      </li>)}
    </ul>}
  </section>;
}
