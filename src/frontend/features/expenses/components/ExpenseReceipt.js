"use client";

import { useState } from "react";
import { FileText, LoaderCircle } from "lucide-react";
import { apiJson } from "@/frontend/lib/apiClient";
import Modal from "@/frontend/components/ui/Modal";
import PdfReceiptPreview from "@/frontend/features/expenses/components/PdfReceiptPreview";

export default function ExpenseReceipt({ expense }) {
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState("");
  if (!expense.hasReceipt) return null;
  async function openReceipt() {
    setLoading(true);
    setError("");
    try {
      const payload = await apiJson(`/api/expenses/${expense.id}/receipt`, { cache: "no-store" });
      setReceipt(payload.data);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  return <div className="mt-2">
    <button type="button" disabled={loading} onClick={openReceipt} className="inline-flex items-center gap-1.5 text-sm font-semibold text-violet-700 hover:text-violet-900 disabled:opacity-60">
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
      {loading ? "Opening receipt…" : "View receipt"}
    </button>
    {error && <p role="alert" className="mt-1 text-sm text-rose-700">{error}</p>}
    {receipt && <Modal title="Expense receipt" onClose={() => setReceipt(null)}>
      <p className="mb-3 text-sm text-slate-600">{expense.type} · ₹{expense.amount.toLocaleString("en-IN")}</p>
      {receipt.type === "pdf"
        ? <PdfReceiptPreview url={receipt.url} />
        // Signed private-storage URLs are deliberately loaded only on demand.
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={receipt.url} alt="Uploaded expense receipt" className="max-h-[55vh] w-full rounded-xl object-contain" />}
      <a href={receipt.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex text-sm font-bold text-violet-700 underline">Open receipt in a new tab</a>
      <p className="mt-2 text-xs text-slate-500">If this preview expires, close it and choose View receipt again.</p>
    </Modal>}
  </div>;
}
