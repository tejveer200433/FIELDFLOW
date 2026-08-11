"use client";

import { X } from "lucide-react";

export default function Modal({ title, onClose, children }) {
  return <div className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950/50 p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{title}</h2>
        <button aria-label="Close" onClick={onClose} className="icon-button"><X className="h-5 w-5" /></button>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  </div>;
}
