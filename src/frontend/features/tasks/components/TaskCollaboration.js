"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Paperclip, Send } from "lucide-react";
import { apiJson, authenticatedFetch } from "@/frontend/lib/apiClient";

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function TaskCollaboration({ taskId }) {
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    const [commentResult, attachmentResult] = await Promise.allSettled([
      apiJson(`/api/tasks/${taskId}/comments`, { cache: "no-store" }),
      apiJson(`/api/tasks/${taskId}/attachments`, { cache: "no-store" })
    ]);
    if (commentResult.status === "fulfilled") setComments(commentResult.value.data || []);
    if (attachmentResult.status === "fulfilled") setAttachments(attachmentResult.value.data || []);
    const failure = [commentResult, attachmentResult].find(result => result.status === "rejected");
    setMessage(failure?.reason?.message || "");
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  async function addComment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form).get("comment");
    if (!String(body || "").trim()) return;
    setBusy(true);
    try {
      const payload = await apiJson(`/api/tasks/${taskId}/comments`, { method: "POST", body: JSON.stringify({ body }) });
      setComments(current => [...current, payload.data]);
      form.reset();
      setMessage("");
    } catch (failure) {
      setMessage(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await authenticatedFetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "The attachment upload failed.");
      setAttachments(current => [payload.data, ...current]);
      setMessage("");
    } catch (failure) {
      setMessage(failure.message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
      setBusy(false);
    }
  }

  async function download(attachment) {
    setBusy(true);
    try {
      const payload = await apiJson(`/api/tasks/${taskId}/attachments?id=${encodeURIComponent(attachment.id)}`, { cache: "no-store" });
      window.open(payload.data.url, "_blank", "noopener,noreferrer");
      setMessage("");
    } catch (failure) {
      setMessage(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="mt-6 space-y-5 border-t border-slate-200 pt-5">
    <div><h3 className="font-bold">Comments</h3><div className="mt-3 max-h-52 space-y-3 overflow-y-auto">{comments.map(comment => <article key={comment.id} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex justify-between gap-3"><strong>{comment.author}</strong><span className="text-xs text-slate-500">{new Date(comment.createdAt).toLocaleString()}</span></div><p className="mt-1 whitespace-pre-wrap text-slate-700">{comment.body}</p></article>)}{!comments.length && <p className="text-sm text-slate-500">No comments yet.</p>}</div><form onSubmit={addComment} className="mt-3 flex gap-2"><input name="comment" maxLength={3000} className="input" placeholder="Add a task comment" /><button disabled={busy} className="btn-primary shrink-0"><Send className="h-4 w-4" />Send</button></form></div>
    <div><div className="flex items-center justify-between gap-3"><h3 className="font-bold">Attachments</h3><label className="btn-secondary cursor-pointer"><Paperclip className="h-4 w-4" />Attach file<input ref={fileRef} disabled={busy} onChange={upload} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,application/zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" /></label></div><div className="mt-3 space-y-2">{attachments.map(attachment => <button type="button" disabled={busy} onClick={() => download(attachment)} key={attachment.id} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left text-sm hover:border-violet-200"><Download className="h-4 w-4 text-violet-600" /><span className="min-w-0 flex-1 truncate font-medium">{attachment.name}</span><span className="text-xs text-slate-500">{formatBytes(attachment.size)}</span></button>)}{!attachments.length && <p className="text-sm text-slate-500">No attachments yet.</p>}</div></div>
    {message && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{message}</p>}
  </section>;
}
