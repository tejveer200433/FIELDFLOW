"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight, Clock3, LocateFixed, MapPin, Plus, Radio, ReceiptText, Send, WalletCards, X } from "lucide-react";
import { useEmployeeTracking } from "@/components/EmployeeTrackingContext";
import EmployeeAttendance from "@/components/EmployeeAttendance";
import { managerTasks } from "@/lib/managerData";
import { apiJson } from "@/lib/apiClient";
import EmployeeProjects from "@/components/EmployeeProjects";

function useIdentity() {
  const [identity, setIdentity] = useState({ employeeId: "employee-demo", employee: "Employee" });
  useEffect(() => setIdentity({ employeeId: localStorage.getItem("fieldflow-employee-id") || "employee-demo", employee: localStorage.getItem("fieldflow-name") || "Employee" }), []);
  return identity;
}

function Heading({ title, subtitle, action }) { return <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-extrabold sm:text-4xl">{title}</h1><p className="mt-2 text-slate-500">{subtitle}</p></div>{action}</div>; }
function Pill({ status }) { const style = status === "Approved" || status === "Completed" || status === "On time" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : status === "Rejected" || status === "Blocked" ? "bg-rose-50 text-rose-700 border-rose-200" : status === "Pending" || status === "Needs Update" || status === "Late" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"; return <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${style}`}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{status}</span>; }
function Modal({ title, onClose, children }) { return <div className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950/50 p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><h2 className="text-xl font-bold">{title}</h2><button onClick={onClose}><X /></button></div><div className="mt-5">{children}</div></section></div>; }

function Home() {
  const router = useRouter();
  const tracking = useEmployeeTracking();
  const window = { alert: async () => { try { const location=await tracking.getPosition(); await apiJson("/api/sos",{method:"POST",body:JSON.stringify({location,message:"Emergency assistance requested"})}); globalThis.alert("SOS sent to your manager and administrator with your GPS location."); } catch(error) { globalThis.alert(error.message); } } };
  const identity = useIdentity();
  const [openAttendance, setOpenAttendance] = useState(null);
  const [completed, setCompleted] = useState(0);
  const [taskItems,setTaskItems]=useState([]);
  const managerTasks=taskItems.map(item=>({...item,employeeId:"e-1"}));
  useEffect(() => { apiJson("/api/attendance", { cache: "no-store" }).then(payload => setOpenAttendance(payload.data.find(item => !item.checkOut) || null)); apiJson("/api/reports", { cache: "no-store" }).then(payload => setCompleted(payload.data.filter(item => item.status === "Approved").length)); apiJson("/api/tasks",{cache:"no-store"}).then(payload=>setTaskItems(payload.data)); }, [identity.employeeId]);
  const actions = [["attendance", "Check In", LocateFixed, "bg-blue-500"], ["reports", "Report", Send, "bg-emerald-500"], ["expenses", "Expense", WalletCards, "bg-violet-500"], ["sos", "SOS", AlertTriangle, "bg-rose-500"]];
  return <><section className="card p-6 sm:p-8"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Good morning</p><h1 className="mt-1 text-2xl font-extrabold">{identity.employee}</h1></div><div className="text-right"><p className="text-xs uppercase tracking-widest text-slate-500">Status</p><Pill status={openAttendance ? "On Duty" : "Offline"} /></div></div><div className="mt-7 grid grid-cols-3 gap-3"><div className="rounded-3xl bg-slate-50 p-5 text-center"><strong className="text-2xl text-blue-600">2</strong><p className="text-xs uppercase tracking-widest text-slate-500">Today</p></div><div className="rounded-3xl bg-slate-50 p-5 text-center"><strong className="text-2xl text-emerald-600">{completed}</strong><p className="text-xs uppercase tracking-widest text-slate-500">Approved</p></div><div className="rounded-3xl bg-slate-50 p-5 text-center"><strong className="text-2xl text-violet-600">{openAttendance ? "Live" : "—"}</strong><p className="text-xs uppercase tracking-widest text-slate-500">Tracking</p></div></div><button onClick={() => router.push("/employee/attendance")} className="btn-secondary mt-5 w-full rounded-full"><Clock3 className="h-5 w-5" />{openAttendance ? "View attendance" : "Check in to start work"}</button></section><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{actions.map(([slug, label, Icon, color]) => <button key={slug} onClick={() => slug === "sos" ? window.alert("SOS noted. For an immediate emergency, call 112.") : router.push(`/employee/${slug}`)} className="card flex flex-col items-center gap-3 p-5 font-bold"><span className={`grid h-12 w-12 place-items-center rounded-full text-white ${color}`}><Icon /></span>{label}</button>)}</div><div className="mt-7 flex justify-between"><h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">Today's tasks</h2><button onClick={() => router.push("/employee/tasks")} className="text-sm font-bold text-blue-600">See all</button></div><div className="mt-3 space-y-3">{managerTasks.filter(task => task.employeeId === "e-1").slice(0, 2).map(task => <button onClick={() => router.push("/employee/tasks")} key={task.id} className="card flex w-full items-center gap-4 p-5 text-left"><span className="grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-600"><ReceiptText /></span><div><h3 className="font-bold">{task.title}</h3><p className="mt-1 text-sm text-slate-500">{task.client} · {task.address}</p><div className="mt-2"><Pill status={task.status} /></div></div><ChevronRight className="ml-auto text-slate-400" /></button>)}</div></>;
}

function LegacyAttendance() {
  const identity = useIdentity();
  const tracking = useEmployeeTracking();
  const [records, setRecords] = useState([]);
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(() => fetch(`/api/attendance?employeeId=${encodeURIComponent(identity.employeeId)}`, { cache: "no-store" }).then(response => response.json()).then(payload => setRecords(payload.data)), [identity.employeeId]);
  useEffect(() => { load(); const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, [load]);
  const open = records.find(item => !item.checkOut);
  async function attendanceAction(action) { setBusy(true); setMessage(""); try { const location = action === "check-in" ? await tracking.startTracking() : await tracking.getPosition(); const response = await fetch("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...identity, action, location }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); if (action === "check-out") await tracking.stopTracking(); setMessage(action === "check-in" ? "Checked in. Live location sharing is active." : "Checked out. Live location sharing stopped."); await load(); } catch (error) { setMessage(error.message); } finally { setBusy(false); } }
  return <><Heading title="Attendance" subtitle="GPS-verified check-in, check-out and history." /><section className="card p-6"><div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-full bg-blue-50 text-blue-600"><Clock3 /></span><div><p className="text-xs uppercase tracking-widest text-slate-500">Current time</p><strong className="text-3xl">{now.toLocaleTimeString()}</strong></div></div>{open && <div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Check-in</p><strong>{open.checkIn}</strong></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">GPS location</p><strong>{open.checkInLocation ? `${Number(open.checkInLocation.latitude).toFixed(5)}, ${Number(open.checkInLocation.longitude).toFixed(5)}` : "Recorded"}</strong></div></div>}<button disabled={busy} onClick={() => attendanceAction(open ? "check-out" : "check-in")} className={`mt-5 w-full rounded-2xl px-5 py-4 font-bold text-white disabled:opacity-50 ${open ? "bg-rose-500" : "bg-blue-600"}`}>{busy ? "Getting GPS location…" : open ? "Check out" : "Check in with GPS"}</button><p className="mt-3 text-center text-sm text-slate-500">Your real device location verifies attendance. Live sharing automatically runs between check-in and check-out.</p>{message && <p className={`mt-3 rounded-xl p-3 text-sm ${message.includes("stopped") || message.includes("active") ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{message}</p>}</section><section className="card mt-6 p-6"><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-widest text-slate-500">Live location</p><strong>{tracking.status === "sharing" ? "Sharing with manager and admin" : tracking.status === "requesting" ? "Requesting GPS…" : "Not sharing"}</strong></div><span className={`grid h-12 w-12 place-items-center rounded-full ${tracking.status === "sharing" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}><Radio /></span></div>{tracking.latest && <p className="mt-3 text-xs text-slate-500">Accuracy {Math.round(tracking.latest.accuracy)} metres · updates every 10 seconds</p>}</section><h2 className="mt-8 text-sm font-bold uppercase tracking-widest text-slate-500">History</h2><div className="mt-3 space-y-3">{records.filter(item => item.checkOut).map(item => <div key={item.id} className="card flex items-center justify-between p-5"><div><strong>{item.date}</strong><p className="text-sm text-slate-500">In {item.checkIn} · Out {item.checkOut}</p></div><div className="text-right"><strong>{item.hours}</strong><div className="mt-1"><Pill status={item.status} /></div></div></div>)}</div></>;
}

function Reports() {
  const identity = useIdentity();

  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [taskItems, setTaskItems] = useState([]);

  const load = useCallback(
    () =>
      apiJson("/api/reports", { cache: "no-store" }).then(payload =>
        setItems(payload.data)
      ),
    [identity.employeeId]
  );

  useEffect(() => {
    load();

    apiJson("/api/tasks", { cache: "no-store" }).then(payload =>
      setTaskItems(payload.data)
    );
  }, [load]);

  async function submit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    const selectedTask = taskItems.find(
      task => task.id === data.taskId
    );

    const reportData = {
      ...data,
      task: selectedTask?.title || "General daily work",
      taskId: selectedTask?.id || null
    };

    try {
      await apiJson("/api/reports", {
        method: "POST",
        body: JSON.stringify(reportData)
      });

      setMessage("Report submitted to your manager.");
      form.reset();
      load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <>
      <Heading
        title="Daily reports"
        subtitle="Summarise the day, flag blockers, and plan tomorrow."
      />

      <form onSubmit={submit} className="card space-y-5 p-6">
        <label>
          <span className="label uppercase tracking-widest">
            Task
          </span>

          <select name="taskId" className="input">
            <option value="">
              General daily work — no assigned task
            </option>

            {taskItems.map(task => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
          <label>
            <span className="label uppercase tracking-widest">
              Work completed
            </span>

            <textarea
              name="workCompleted"
              required
              className="input min-h-28"
              placeholder="What did you accomplish today?"
            />
          </label>

          <label>
            <span className="label uppercase tracking-widest">
              Hours
            </span>

            <input
              name="hours"
              required
              type="number"
              min="0.5"
              max="24"
              step="0.5"
              className="input"
              placeholder="8"
            />
          </label>
        </div>

        <label>
          <span className="label uppercase tracking-widest">
            Problems / delays
          </span>

          <input
            name="problems"
            className="input"
            placeholder="Optional"
          />
        </label>

        <label>
          <span className="label uppercase tracking-widest">
            Tomorrow's plan
          </span>

          <input
            name="tomorrowPlan"
            className="input"
            placeholder="Optional"
          />
        </label>

        <button className="btn-primary w-full rounded-full py-4">
          <Send className="h-4 w-4" />
          Submit report
        </button>

        {message && (
          <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-700">
            {message}
          </p>
        )}
      </form>

      <h2 className="mt-8 text-sm font-bold uppercase tracking-widest text-slate-500">
        Recent reports
      </h2>

      <div className="mt-3 space-y-3">
        {items.map(item => (
          <article key={item.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">{item.workCompleted}</h3>

                <p className="mt-1 text-sm text-slate-500">
                  {item.date} · {item.hours}h · {item.task}
                </p>
              </div>

              <Pill status={item.status} />
            </div>

            {item.managerComment && (
              <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
                <strong>Manager:</strong> {item.managerComment}
              </p>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

function Expenses() {
  const identity = useIdentity();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => apiJson("/api/expenses", { cache: "no-store" }).then(payload => setItems(payload.data)), [identity.employeeId]);
  useEffect(() => { load(); }, [load]);
  async function submit(event) { event.preventDefault(); try { await apiJson("/api/expenses", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); setOpen(false); load(); } catch(error) { window.alert(error.message); } }
  const pending = items.filter(item => item.status === "Pending").reduce((sum, item) => sum + item.amount, 0); const approved = items.filter(item => item.status === "Approved").reduce((sum, item) => sum + item.amount, 0);
  return <><Heading title="Expenses" subtitle="Log field costs and track approvals." action={<button onClick={() => setOpen(true)} className="btn-primary rounded-full px-7 py-4"><Plus />New</button>} /><div className="grid gap-4 sm:grid-cols-2"><div className="card p-6"><p className="text-xs uppercase tracking-widest text-slate-500">Pending</p><strong className="mt-2 block text-3xl text-amber-600">₹{pending.toLocaleString("en-IN")}</strong></div><div className="card p-6"><p className="text-xs uppercase tracking-widest text-slate-500">Approved</p><strong className="mt-2 block text-3xl text-emerald-600">₹{approved.toLocaleString("en-IN")}</strong></div></div><div className="mt-5 space-y-3">{items.map(item => <div className="card flex items-center justify-between gap-4 p-5" key={item.id}><div><strong>₹{item.amount.toLocaleString("en-IN")} · {item.type}</strong><p className="mt-1 text-sm text-slate-500">{item.date} · {item.note}</p>{item.managerComment && <p className="mt-2 text-xs text-blue-700">Manager: {item.managerComment}</p>}</div><Pill status={item.status} /></div>)}</div>{open && <Modal title="New expense" onClose={() => setOpen(false)}><form onSubmit={submit} className="space-y-4"><label><span className="label">Type</span><select name="type" className="input"><option>Travel</option><option>Meals</option><option>Fuel</option><option>Materials</option><option>Tools</option></select></label><label><span className="label">Amount</span><input name="amount" type="number" min="1" required className="input" /></label><label><span className="label">Description</span><textarea name="note" required className="input min-h-24" /></label><button className="btn-primary w-full">Submit expense</button></form></Modal>}</>;
}

function Tasks() {
  const [selected,setSelected]=useState(null); const [tasks,setTasks]=useState([]);
  useEffect(()=>{apiJson("/api/tasks",{cache:"no-store"}).then(payload=>setTasks(payload.data));},[]);
  async function update(id,status){const payload=await apiJson("/api/tasks",{method:"PATCH",body:JSON.stringify({id,status})});setTasks(current=>current.map(item=>item.id===id?payload.data:item));setSelected(payload.data);}
  return <><Heading title="My tasks" subtitle="Today's assigned field work."/><div className="space-y-3">{tasks.map(task=><button onClick={()=>setSelected(task)} key={task.id} className="card flex w-full items-center gap-4 p-5 text-left"><span className="grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-600"><MapPin/></span><div><h2 className="font-bold">{task.title}</h2><p className="text-sm text-slate-500">{task.client} · {task.address}</p><div className="mt-2"><Pill status={task.status}/></div></div><ChevronRight className="ml-auto"/></button>)}</div>{selected&&<Modal title={selected.title} onClose={()=>setSelected(null)}><p className="text-slate-500">{selected.client}</p><p className="mt-3 flex items-center gap-2"><MapPin className="h-4 w-4"/>{selected.address}</p><div className="mt-4"><Pill status={selected.status}/></div><div className="mt-5 flex flex-wrap gap-2">{["On The Way","In Progress","Completed","Blocked"].map(status=><button key={status} onClick={()=>update(selected.id,status)} className="btn-secondary text-sm">{status}</button>)}</div><a className="btn-primary mt-6 w-full" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(selected.address)}`}>Open directions</a></Modal>}</>;
}

function Profile() { const identity = useIdentity(); const router = useRouter(); return <><Heading title="My profile" subtitle="Your FieldFlow employee account." /><section className="card p-7 text-center"><div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-blue-100 text-3xl font-bold text-blue-700">{identity.employee.charAt(0)}</div><h2 className="mt-4 text-2xl font-bold">{identity.employee}</h2><p className="text-slate-500">{typeof window !== "undefined" ? localStorage.getItem("fieldflow-user") : ""}</p><button onClick={() => router.push("/employee/expenses")} className="btn-secondary mt-6">View expenses</button></section></>;
}

export default function EmployeeWorkspace({ section }) {
  const content = useMemo(() => { if (!section) return <Home />; if (section === "tasks") return <EmployeeProjects />; if (section === "attendance") return <EmployeeAttendance />; if (section === "reports") return <Reports />; if (section === "expenses") return <Expenses />; if (section === "profile") return <Profile />; return <Home />; }, [section]);
  return content;
}
