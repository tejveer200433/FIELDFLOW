"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ShieldOff, X } from "lucide-react";
import { getBlocklistOverrideRequests, reviewBlocklistRequest } from "@/lib/activity/policyClient";
import { formatDateTime } from "@/lib/activity/adminFormatters";

function Badge({ value }) {
  const style = value === "Approved"
    ? "bg-emerald-50 text-emerald-700"
    : value === "Rejected" || value === "Expired"
      ? "bg-rose-50 text-rose-700"
      : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${style}`}>{value}</span>;
}

export default function BlocklistOverrideAdministration() {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [minutesById, setMinutesById] = useState({});

  const load = useCallback(async () => {
    try {
      setRequests(await getBlocklistOverrideRequests());
      setError(null);
    } catch (requestError) {
      setError(requestError);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function review(item, decision) {
    setBusyId(item.id);
    try {
      await reviewBlocklistRequest({
        id: item.id,
        decision,
        grantedMinutes: decision === "Approved" ? (Number(minutesById[item.id]) || item.requestedMinutes) : null,
        comment: decision === "Approved" ? "Approved." : "Rejected by monitoring administrator."
      });
      await load();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setBusyId("");
    }
  }

  const pending = requests.filter(item => item.status === "Pending");
  const resolved = requests.filter(item => item.status !== "Pending").slice(0, 20);

  return <section className="card overflow-hidden">
    <div className="flex items-center gap-3 border-b px-5 py-4"><ShieldOff className="h-5 w-5 text-blue-600" /><div><h2 className="font-bold">Site access requests</h2><p className="text-sm text-slate-500">Employees requesting temporary access to a blocked site.</p></div></div>
    {error && <p role="alert" className="border-b bg-rose-50 px-5 py-3 text-sm text-rose-700">{error.message}</p>}
    <div className="divide-y">
      {pending.map(item => <article key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div><strong>{item.domain}</strong><p className="mt-1 text-sm text-slate-500">Requested {item.requestedMinutes} min · {formatDateTime(item.createdAt)}</p><p className="mt-1 text-sm">{item.reason}</p></div>
        <div className="flex items-center gap-2">
          <input type="number" min={5} max={480} defaultValue={item.requestedMinutes}
            onChange={event => setMinutesById(current => ({ ...current, [item.id]: event.target.value }))}
            className="input w-20" aria-label="Minutes to grant" />
          <button disabled={busyId === item.id} onClick={() => review(item, "Approved")} className="btn-primary"><Check className="h-4 w-4" />Approve</button>
          <button disabled={busyId === item.id} onClick={() => review(item, "Rejected")} className="btn-secondary text-rose-700"><X className="h-4 w-4" />Reject</button>
        </div>
      </article>)}
      {!pending.length && <p className="p-8 text-center text-sm text-slate-500">No pending access requests.</p>}
    </div>
    {resolved.length > 0 && <div className="border-t"><div className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">Recently resolved</div><div className="divide-y">{resolved.map(item => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-5"><div><strong>{item.domain}</strong><p className="text-sm text-slate-500">{item.reviewerComment}</p></div><Badge value={item.status} /></article>)}</div></div>}
  </section>;
}
