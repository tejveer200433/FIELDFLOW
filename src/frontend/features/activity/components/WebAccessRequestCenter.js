"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldQuestion } from "lucide-react";
import { createWebAccessRequest, getWebAccessRequests } from "@/frontend/features/activity/api/webAccessClient";

const labels = { domain: "Website", application: "Desktop application", category: "Category" };

export default function WebAccessRequestCenter({ devices = [] }) {
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => getWebAccessRequests().then(result => setRequests(result.requests || [])).catch(failure => setError(failure.message)), []);
  useEffect(() => { load(); }, [load]);

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const response = await createWebAccessRequest({ resourceType: values.resourceType, resourceKey: values.resourceKey, reason: values.reason, requestedMinutes: Number(values.requestedMinutes), requestedScope: values.requestedScope, deviceId: values.deviceId || null });
      setMessage(response.message); event.currentTarget.reset(); await load();
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }

  return <section className="card overflow-hidden">
    <div className="border-b p-5"><h2 className="flex items-center gap-2 font-bold"><ShieldQuestion className="h-5 w-5 text-blue-600" />Web and application access</h2><p className="mt-1 text-sm text-slate-500">Request time-limited access to a restricted website, category, or installed application. Access expires automatically.</p></div>
    <div className="grid xl:grid-cols-[420px_1fr]">
      <form onSubmit={submit} className="space-y-4 border-b p-5 xl:border-b-0 xl:border-r">
        <label><span className="label">Access type</span><select name="resourceType" className="input"><option value="domain">Website domain</option><option value="application">Desktop application</option><option value="category">Website category</option></select></label>
        <label><span className="label">Website or application</span><input name="resourceKey" required className="input" placeholder="youtube.com or whatsapp" /></label>
        {devices.length > 0 && <label><span className="label">Device (optional)</span><select name="deviceId" className="input"><option value="">All my devices</option>{devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.deviceName}</option>)}</select></label>}
        <label><span className="label">Business reason</span><textarea name="reason" required minLength={3} maxLength={500} className="input min-h-24" /></label>
        <div className="grid grid-cols-2 gap-3"><label><span className="label">Requested scope</span><select name="requestedScope" className="input"><option value="once">One-time</option><option value="shift">This shift</option><option value="project">This project</option><option value="seven_days">Seven days</option><option value="always">Always allow</option></select></label><label><span className="label">Minutes</span><input name="requestedMinutes" type="number" min="5" max="10080" defaultValue="30" className="input" /></label></div>
        <button disabled={busy} className="btn-primary w-full">{busy ? "Submitting…" : "Send access request"}</button>
        {message && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}{error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      </form>
      <div className="divide-y">{requests.slice(0, 20).map(item => <article key={item.id} className="p-5"><div className="flex justify-between gap-3"><div><strong>{item.resourceKey}</strong><p className="text-xs text-slate-500">{labels[item.resourceType]} · {item.requestedScope.replace("_", " ")}</p></div><span className={`h-fit rounded-full px-2.5 py-1 text-xs font-bold ${item.status === "Approved" ? "bg-emerald-50 text-emerald-700" : item.status === "Pending" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{item.status}</span></div><p className="mt-2 text-sm">{item.reason}</p>{item.accessEndsAt && <p className="mt-2 text-xs text-slate-500">Access ends {new Date(item.accessEndsAt).toLocaleString()}</p>}</article>)}{!requests.length && <p className="p-8 text-center text-sm text-slate-500">No access requests yet.</p>}</div>
    </div>
  </section>;
}
