"use client";

import { useEffect, useState } from "react";
import { Image as ImageIcon, Trash2 } from "lucide-react";
import ActivityEmptyState from "@/components/activity/ActivityEmptyState";
import { formatDateTime } from "@/lib/activity/formatters";
import { getScreenshotSignedUrl } from "@/lib/activity/client";

export default function ScreenshotActivitySummary({
  enabled = false,
  screenshots = [],
  canDelete = false,
  onDelete
}) {
  const [preview, setPreview] = useState(null);
  const [loadingPath, setLoadingPath] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const visibleIds = new Set(screenshots.map(screenshot => screenshot.id));
    setSelected(current => new Set([...current].filter(id => visibleIds.has(id))));
  }, [screenshots]);

  async function open(screenshot) {
    setError("");
    setLoadingPath(screenshot.storagePath);
    try {
      const url = await getScreenshotSignedUrl(screenshot.storagePath);
      setPreview({ url, screenshot });
    } catch (fetchError) {
      setError(fetchError.message || "The screenshot could not be loaded.");
    } finally {
      setLoadingPath(null);
    }
  }

  function toggleSelected(id) {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function removeSelected() {
    const ids = [...selected];
    if (!ids.length || !onDelete) return;
    if (!window.confirm(`Permanently delete ${ids.length} screenshot${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setDeleting(true);
    setError("");
    try {
      await onDelete(ids);
      setPreview(null);
      setSelected(new Set());
    } catch (deleteError) {
      setError(deleteError.message || "The selected screenshots could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  return <section className="card p-5 sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-center gap-3"><ImageIcon className="h-5 w-5 text-blue-600" /><div><h2 className="font-bold">Screenshots</h2><p className="text-sm text-slate-500">Periodic desktop captures, when enabled by your organisation.</p></div></div>
      {canDelete && selected.size > 0 && <button type="button" disabled={deleting} onClick={removeSelected} className="btn-secondary border-rose-200 text-rose-700"><Trash2 className="h-4 w-4" />{deleting ? "Deleting…" : `Delete selected (${selected.size})`}</button>}
    </div>
    {screenshots.length
      ? <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{screenshots.map(shot => <article key={shot.storagePath} className={`rounded-xl border p-3 text-xs ${selected.has(shot.id) ? "border-rose-300 bg-rose-50" : ""}`}>
          {canDelete && <label className="mb-2 flex items-center gap-2 font-semibold text-slate-600"><input type="checkbox" checked={selected.has(shot.id)} disabled={deleting} onChange={() => toggleSelected(shot.id)} />Select</label>}
          <span className="block font-semibold">{formatDateTime(shot.capturedAt)}</span>
          <span className="mt-1 block truncate text-slate-500">{shot.activeApplication || "Unknown application"}</span>
          <button type="button" onClick={() => open(shot)} disabled={loadingPath === shot.storagePath || deleting} className="mt-2 text-blue-600 disabled:opacity-60">{loadingPath === shot.storagePath ? "Loading…" : "View"}</button>
        </article>)}</div>
      : !enabled
        ? <div className="mt-5"><ActivityEmptyState title="Not collected" description="Your organisation has not enabled screenshot capture." /></div>
        : <div className="mt-5"><ActivityEmptyState title="No screenshots yet" description="Screenshots appear here after the desktop agent captures one during a tracking session." /></div>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
    {preview && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950/70 p-6" onClick={() => setPreview(null)}>
      <div className="max-h-full max-w-3xl overflow-auto rounded-2xl bg-white p-4" onClick={event => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">{formatDateTime(preview.screenshot.capturedAt)}</p><button type="button" onClick={() => setPreview(null)} className="btn-secondary">Close</button></div>
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private storage bucket, not an optimizable static asset */}
        <img src={preview.url} alt={`Screenshot captured ${formatDateTime(preview.screenshot.capturedAt)}`} className="max-w-full rounded-xl" />
      </div>
    </div>}
    <p className="mt-4 text-xs text-slate-500">Never captured while an excluded application is active. Links expire five minutes after loading.</p>
  </section>;
}
