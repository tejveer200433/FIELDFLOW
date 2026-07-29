"use client";

import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { policyChangeLabel } from "@/lib/activity/adminFormatters";
import { policyChanges, policyFormValues, policyRanges, validatePolicy } from "@/lib/activity/adminValidation";

const numberFields = [
  ["idleThresholdSeconds", "Idle threshold (seconds)", "How long without recorded input before a sample is idle."],
  ["sampleIntervalSeconds", "Sample interval (seconds)", "How often the desktop agent creates an aggregate sample."],
  ["uploadIntervalSeconds", "Upload interval (seconds)", "How often queued samples are uploaded."],
  ["heartbeatIntervalSeconds", "Heartbeat interval (seconds)", "How often the agent reports its online state."],
  ["offlineSyncLimitSeconds", "Offline sync limit (seconds)", "Maximum age accepted for offline samples."],
  ["retentionDays", "Retention period (days)", "Configured retention period for activity records."]
];

export default function MonitoringPolicyForm({ policy, busy, onSave }) {
  const [values, setValues] = useState(() => policyFormValues(policy));
  const [errors, setErrors] = useState({});
  useEffect(() => setValues(policyFormValues(policy)), [policy]);
  const changes = useMemo(() => policyChanges(policy, values), [policy, values]);

  function set(field, value) {
    setValues(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: null }));
  }

  async function submit(event) {
    event.preventDefault();
    const validation = validatePolicy(values);
    setErrors(validation);
    if (Object.keys(validation).length) return;
    if (!changes.length) {
      setErrors({ form: "Change at least one setting before creating a new policy version." });
      return;
    }
    if (!policy?.trackingEnabled && values.trackingEnabled) {
      const approved = window.confirm(
        `Enable employee monitoring?\n\nCollected during explicit work sessions: aggregate keyboard and mouse counts, active/idle time, device status, agent version${values.collectApplicationNames ? ", and active application names" : ""}.\n\nSampling: ${values.sampleIntervalSeconds}s. Heartbeat: ${values.heartbeatIntervalSeconds}s. Retention: ${values.retentionDays} days. Acknowledgement required: ${values.requireAcknowledgement ? "Yes" : "No"}.\n\nEmployees must use a visible desktop agent. Attendance and location sharing remain separate.`
      );
      if (!approved) return;
    }
    if (policy && values.retentionDays < policy.retentionDays && !window.confirm(`Reduce retention from ${policy.retentionDays} to ${values.retentionDays} days? This creates a new policy version.`)) return;
    await onSave(values);
  }

  return <form onSubmit={submit} className="card p-5 sm:p-6"><div><h2 className="font-bold">Create a new policy version</h2><p className="mt-1 text-sm text-slate-500">The active policy is never edited in place. Server validation remains authoritative.</p></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">{numberFields.map(([field, label, help]) => <label key={field}><span className="label">{label}</span><input type="number" className="input" value={values[field]} min={policyRanges[field][0]} max={policyRanges[field][1]} onChange={event => set(field, Number(event.target.value))} /><span className="mt-1 block text-xs text-slate-500">{help} Allowed: {policyRanges[field][0]}–{policyRanges[field][1]}.</span>{errors[field] && <span className="mt-1 block text-xs text-rose-600">{errors[field]}</span>}</label>)}</div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="flex items-start gap-3 rounded-xl border p-4"><input type="checkbox" checked={values.trackingEnabled} onChange={event => set("trackingEnabled", event.target.checked)} className="mt-1 h-4 w-4" /><span><strong className="block text-sm">Enable monitoring</strong><span className="text-xs text-slate-500">Employees can start explicit tracking sessions.</span></span></label><label className="flex items-start gap-3 rounded-xl border p-4"><input type="checkbox" checked={values.collectApplicationNames} onChange={event => set("collectApplicationNames", event.target.checked)} className="mt-1 h-4 w-4" /><span><strong className="block text-sm">Collect application names</strong><span className="text-xs text-slate-500">Does not include titles, URLs, documents, or file paths.</span></span></label><label className="flex items-start gap-3 rounded-xl border p-4"><input type="checkbox" checked={values.requireAcknowledgement} onChange={event => set("requireAcknowledgement", event.target.checked)} className="mt-1 h-4 w-4" /><span><strong className="block text-sm">Require acknowledgement</strong><span className="text-xs text-slate-500">Employees acknowledge each active policy version.</span></span></label></div>
    <section className="mt-5 rounded-xl bg-slate-50 p-4"><h3 className="text-sm font-bold">Changes in the next version</h3>{changes.length ? <ul className="mt-2 space-y-1 text-sm text-slate-600">{changes.map(change => <li key={change.field}>{policyChangeLabel(change.field)}: <strong>{String(change.before)}</strong> → <strong>{String(change.after)}</strong></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No changes yet.</p>}</section>
    {errors.form && <p role="alert" className="mt-3 text-sm text-rose-600">{errors.form}</p>}
    <button type="submit" disabled={busy} className="btn-primary mt-5"><Save className="h-4 w-4" />{busy ? "Creating version…" : "Create and activate policy version"}</button>
  </form>;
}
