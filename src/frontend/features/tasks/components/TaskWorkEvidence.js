"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { apiJson } from "@/frontend/lib/apiClient";

function duration(seconds) {
  const minutes = Math.round((Number(seconds) || 0) / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const bandLabels = {
  verified: "Verified evidence",
  supported: "Supported evidence",
  insufficient: "Evidence still building"
};

const bandStyles = {
  verified: "border-emerald-200 bg-emerald-50 text-emerald-950",
  supported: "border-blue-200 bg-blue-50 text-blue-950",
  insufficient: "border-slate-200 bg-slate-50 text-slate-900"
};

export default function TaskWorkEvidence({ taskId }) {
  const [data, setData] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await apiJson(`/api/tasks/${taskId}/evidence`, { cache: "no-store" });
      setData(result.data);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Work evidence could not be loaded.");
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  async function submit(event) {
    event.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    try {
      const result = await apiJson(`/api/tasks/${taskId}/evidence`, { method: "POST", body: JSON.stringify({ note }) });
      setData(current => current ? { ...current, contexts: [result.data, ...current.contexts], summary: { ...current.summary, contextCount: current.summary.contextCount + 1 } } : current);
      setNote("");
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Context could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!data && !message) return <section className="mt-6 border-t border-slate-200 pt-5"><p className="text-sm text-slate-500">Loading verified work evidence...</p></section>;
  if (!data) return <section className="mt-6 border-t border-slate-200 pt-5"><p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{message}</p></section>;

  const { summary } = data;
  return <section className="mt-6 border-t border-slate-200 pt-5">
    <div className={`rounded-lg border p-4 ${bandStyles[summary.confidenceBand] || bandStyles.insufficient}`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /><h3 className="font-bold">Verified Work Evidence</h3></div><strong>{bandLabels[summary.confidenceBand] || bandLabels.insufficient} · {summary.confidenceScore}/100</strong></div>
      <p className="mt-2 text-sm">Task-linked sessions, service heartbeats, and integrity checks are summarized here. This is a confidence signal, not an automated performance decision.</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><span className="block text-xs opacity-70">Tracked</span><strong>{duration(summary.trackedSeconds)}</strong></div><div><span className="block text-xs opacity-70">Sessions</span><strong>{summary.sessionCount}</strong></div><div><span className="block text-xs opacity-70">Heartbeats</span><strong>{summary.heartbeatCount}</strong></div><div><span className="block text-xs opacity-70">Open checks</span><strong>{summary.integrityAlertCount}</strong></div></div>
    </div>
    <div className="mt-4"><h3 className="font-bold">Employee context</h3><p className="mt-1 text-sm text-slate-500">Add relevant delivery context, such as offline work, a customer delay, or a system issue.</p>
      {data.canAddContext && <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={note} maxLength={1000} onChange={event => setNote(event.target.value)} className="input" placeholder="Add context to this task evidence" /><button disabled={busy || !note.trim()} className="btn-secondary shrink-0">Add context</button></form>}
      <div className="mt-3 space-y-2">{data.contexts.map(context => <article key={context.id} className="rounded-lg bg-slate-50 p-3 text-sm"><div className="flex justify-between gap-3"><strong>{context.author}</strong><time className="text-xs text-slate-500">{new Date(context.createdAt).toLocaleString()}</time></div><p className="mt-1 whitespace-pre-wrap text-slate-700">{context.note}</p></article>)}{!data.contexts.length && <p className="text-sm text-slate-500">No employee context has been added.</p>}</div>
    </div>
    {message && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{message}</p>}
  </section>;
}
