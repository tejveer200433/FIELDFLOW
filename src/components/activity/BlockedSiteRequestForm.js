"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldOff } from "lucide-react";
import { createBlocklistRequest, getBlocklistRequests } from "@/lib/activity/client";

function Badge({ value }) {
  const style = value === "Approved"
    ? "bg-emerald-50 text-emerald-700"
    : value === "Rejected" || value === "Expired"
      ? "bg-rose-50 text-rose-700"
      : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${style}`}>{value}</span>;
}

export default function BlockedSiteRequestForm() {
  const searchParams = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setRequests(await getBlocklistRequests());
    } catch (failure) {
      setError(failure.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const response = await createBlocklistRequest({
        domain: values.domain,
        reason: values.reason,
        requestedMinutes: Number(values.requestedMinutes) || 30
      });
      setMessage(response.message);
      event.currentTarget.reset();
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
    <section className="card h-fit p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-bold"><ShieldOff className="h-4 w-4" />Request temporary site access</h2>
      <p className="mt-1 text-sm text-slate-500">A manager or admin reviews every request before access is granted.</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <div><label className="label">Site (domain)</label><input name="domain" required defaultValue={searchParams.get("requestDomain") || ""} placeholder="example.com" className="input" /></div>
        <div><label className="label">Reason</label><textarea name="reason" required minLength={1} maxLength={500} className="input min-h-24" /></div>
        <div><label className="label">Minutes needed</label><input name="requestedMinutes" type="number" min={5} max={480} defaultValue={30} className="input" /></div>
        <button disabled={busy} className="btn-primary w-full">{busy ? "Submitting…" : "Send request"}</button>
      </form>
      {message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    </section>

    <section className="card overflow-hidden">
      <div className="border-b px-5 py-4"><h2 className="font-bold">My access requests</h2></div>
      <div className="divide-y">{requests.map(item => <article key={item.id} className="p-5">
        <div className="flex flex-wrap justify-between gap-3"><div><strong>{item.domain}</strong><p className="text-sm text-slate-500">Requested {item.requestedMinutes} min{item.grantedMinutes ? ` · granted ${item.grantedMinutes} min` : ""}</p></div><Badge value={item.status} /></div>
        <p className="mt-2 text-sm">{item.reason}</p>
        {item.reviewerComment && <p className="mt-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">Reviewer: {item.reviewerComment}</p>}
      </article>)}{!requests.length && <p className="p-8 text-center text-sm text-slate-500">No access requests yet.</p>}</div>
    </section>
  </div>;
}
