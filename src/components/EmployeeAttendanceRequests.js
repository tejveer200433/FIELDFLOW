"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, FilePenLine, Plus } from "lucide-react";
import { apiJson } from "@/lib/apiClient";

function Badge({ value }) {
  const style = value === "Approved"
    ? "bg-emerald-50 text-emerald-700"
    : value === "Rejected"
      ? "bg-rose-50 text-rose-700"
      : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${style}`}>{value}</span>;
}

export default function EmployeeAttendanceRequests() {
  const [data, setData] = useState({ leaves: [], corrections: [], holidays: [] });
  const [shifts, setShifts] = useState([]);
  const [form, setForm] = useState("leave");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [management, attendance] = await Promise.all([
        apiJson("/api/attendance-management", { cache: "no-store" }),
        apiJson("/api/attendance", { cache: "no-store" })
      ]);
      setData(management.data);
      setShifts(attendance.data);
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit(event, action) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const body = action === "leave"
        ? { action, type: values.type, startDate: values.startDate, endDate: values.endDate, reason: values.reason }
        : {
            action,
            shiftId: values.shiftId,
            requestedCheckInAt: values.requestedCheckInAt ? new Date(values.requestedCheckInAt).toISOString() : null,
            requestedCheckOutAt: values.requestedCheckOutAt ? new Date(values.requestedCheckOutAt).toISOString() : null,
            reason: values.reason
          };
      const payload = await apiJson("/api/attendance-management", {
        method: "POST",
        body: JSON.stringify(body)
      });
      setMessage(payload.message);
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
      <div className="flex gap-2">
        <button onClick={() => setForm("leave")} className={form === "leave" ? "btn-primary flex-1" : "btn-secondary flex-1"}><CalendarDays className="h-4 w-4" />Leave</button>
        <button onClick={() => setForm("correction")} className={form === "correction" ? "btn-primary flex-1" : "btn-secondary flex-1"}><FilePenLine className="h-4 w-4" />Correction</button>
      </div>

      {form === "leave" ? <form onSubmit={event => submit(event, "leave")} className="mt-5 space-y-4">
        <div><label className="label">Leave type</label><select name="type" className="input"><option>Annual</option><option>Sick</option><option>Casual</option><option>Unpaid</option><option>Other</option></select></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="label">From</label><input name="startDate" type="date" required className="input" /></div><div><label className="label">To</label><input name="endDate" type="date" required className="input" /></div></div>
        <div><label className="label">Reason</label><textarea name="reason" required minLength={2} className="input min-h-24" /></div>
        <button disabled={busy} className="btn-primary w-full"><Plus className="h-4 w-4" />{busy ? "Submitting..." : "Request leave"}</button>
      </form> : <form onSubmit={event => submit(event, "correction")} className="mt-5 space-y-4">
        <div><label className="label">Attendance record</label><select name="shiftId" required className="input"><option value="">Select date</option>{shifts.map(shift => <option key={shift.id} value={shift.id}>{shift.date} · {shift.checkIn}–{shift.checkOut || "missing checkout"}</option>)}</select></div>
        <div><label className="label">Corrected check-in</label><input name="requestedCheckInAt" type="datetime-local" className="input" /></div>
        <div><label className="label">Corrected check-out</label><input name="requestedCheckOutAt" type="datetime-local" className="input" /></div>
        <div><label className="label">Reason</label><textarea name="reason" required minLength={2} className="input min-h-24" /></div>
        <button disabled={busy} className="btn-primary w-full"><FilePenLine className="h-4 w-4" />{busy ? "Submitting..." : "Request correction"}</button>
      </form>}
      {message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    </section>

    <div className="space-y-6">
      <section className="card overflow-hidden">
        <div className="border-b px-5 py-4"><h2 className="font-bold">My leave requests</h2></div>
        <div className="divide-y">{data.leaves.map(item => <article key={item.id} className="p-5">
          <div className="flex flex-wrap justify-between gap-3"><div><strong>{item.type} leave</strong><p className="text-sm text-slate-500">{item.startDate} to {item.endDate}</p></div><Badge value={item.status} /></div>
          <p className="mt-2 text-sm">{item.reason}</p>{item.reviewerComment && <p className="mt-2 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">Reviewer: {item.reviewerComment}</p>}
        </article>)}{!data.leaves.length && <p className="p-8 text-center text-sm text-slate-500">No leave requests yet.</p>}</div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b px-5 py-4"><h2 className="font-bold">Attendance corrections</h2></div>
        <div className="divide-y">{data.corrections.map(item => <article key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-5"><div><strong>{new Date(item.createdAt).toLocaleDateString()}</strong><p className="mt-1 text-sm text-slate-500">{item.reason}</p>{item.reviewerComment && <p className="mt-2 text-sm text-blue-700">Reviewer: {item.reviewerComment}</p>}</div><Badge value={item.status} /></article>)}{!data.corrections.length && <p className="p-8 text-center text-sm text-slate-500">No correction requests yet.</p>}</div>
      </section>

      {data.holidays.length > 0 && <section className="card p-5"><h2 className="font-bold">Upcoming holidays</h2><div className="mt-3 flex flex-wrap gap-2">{data.holidays.map(item => <span key={item.id} className="rounded-full bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700">{item.date} · {item.name}</span>)}</div></section>}
    </div>
  </div>;
}
