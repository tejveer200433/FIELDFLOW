"use client";

import { useEffect, useRef, useState } from "react";

export default function PdfReceiptPreview({ url }) {
  const canvasRef = useRef(null);
  const [document, setDocument] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let task;
    setLoading(true);
    setError("");
    setDocument(null);
    setPage(1);
    async function load() {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (!active) return;
        const assets = `/pdfjs/${pdfjs.version}/`;
        pdfjs.GlobalWorkerOptions.workerSrc = `${assets}pdf.worker.min.mjs`;
        task = pdfjs.getDocument({
          url,
          cMapUrl: `${assets}cmaps/`, cMapPacked: true,
          standardFontDataUrl: `${assets}standard_fonts/`,
          wasmUrl: `${assets}wasm/`
        });
        task.onPassword = () => {
          if (active) {
            setError("This PDF is password-protected. Open it in a new tab to view it.");
            setLoading(false);
          }
          void task.destroy();
        };
        const pdf = await task.promise;
        if (active) setDocument(pdf);
      } catch {
        if (active) {
          setError(current => current || "The PDF could not be previewed. Try reopening it or use the link below.");
          setLoading(false);
        }
      }
    }
    void load();
    return () => { active = false; if (task) void task.destroy(); };
  }, [url]);

  useEffect(() => {
    if (!document) return;
    let active = true;
    let rendering;
    setLoading(true);
    setError("");
    async function draw() {
      try {
        const pdfPage = await document.getPage(page);
        if (!active || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const natural = pdfPage.getViewport({ scale: 1 });
        // Bound the pixel buffer while keeping small text legible on mobile.
        const viewport = pdfPage.getViewport({ scale: Math.min(2, 1400 / natural.width, 1800 / natural.height) });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        rendering = pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport });
        await rendering.promise;
        if (active) setLoading(false);
      } catch {
        if (active) {
          setError("This page could not be displayed. Open the PDF using the link below.");
          setLoading(false);
        }
      }
    }
    void draw();
    return () => { active = false; rendering?.cancel(); };
  }, [document, page]);

  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    {loading && <p role="status" className="py-4 text-center text-sm text-slate-600">Loading PDF…</p>}
    {error && <p role="alert" className="py-4 text-sm text-rose-700">{error}</p>}
    <div className="max-h-[55vh] overflow-auto">
      <canvas ref={canvasRef} aria-label={`Receipt PDF page ${page}`} role="img" className={`h-auto w-full bg-white ${loading || error ? "hidden" : "block"}`} />
    </div>
    {document && <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-600">
      <button type="button" disabled={loading || page <= 1} onClick={() => setPage(current => current - 1)} className="rounded-lg border bg-white px-3 py-2 font-semibold disabled:opacity-40">Previous</button>
      <span>Page {page} of {document.numPages}</span>
      <button type="button" disabled={loading || page >= document.numPages} onClick={() => setPage(current => current + 1)} className="rounded-lg border bg-white px-3 py-2 font-semibold disabled:opacity-40">Next</button>
    </div>}
  </div>;
}
