"use client";

import { useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { visibleAcknowledgementText } from "@/lib/activity/client";

export default function MonitoringAcknowledgement({ policy, busy, onAcknowledge }) {
  const [checked, setChecked] = useState(false);
  if (!policy?.requireAcknowledgement) return null;
  if (policy.acknowledgementStatus?.acknowledged) {
    return <section className="card border-emerald-200 bg-emerald-50 p-5">
      <div className="flex gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /><div><h2 className="font-bold text-emerald-900">Policy acknowledged</h2><p className="mt-1 text-sm text-emerald-700">Version {policy.policyVersion} acknowledged for your account.</p></div></div>
    </section>;
  }
  const text = visibleAcknowledgementText(policy);
  return <section className="card border-amber-200 p-5 sm:p-6">
    <div className="flex items-start gap-3"><ShieldCheck className="h-6 w-6 shrink-0 text-amber-600" /><div><h2 className="font-bold">Acknowledgement required</h2><p className="mt-1 text-sm text-slate-500">Review and acknowledge policy version {policy.policyVersion} before starting a session.</p></div></div>
    <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">{text}</div>
    <p className="mt-3 text-sm text-slate-600">Your activity records can be viewed by you and by authorised managers or administrators according to FieldFlow permissions. Retention: {policy.retentionDays} days.</p>
    <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm font-medium">
      <input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300" />
      <span>I have read and acknowledge the visible statement above.</span>
    </label>
    <button type="button" disabled={!checked || busy} onClick={() => onAcknowledge(text).then(() => setChecked(false))} className="btn-primary mt-4 w-full sm:w-auto">
      {busy ? "Acknowledging…" : "Acknowledge policy"}
    </button>
  </section>;
}
