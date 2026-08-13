"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronRight, MapPin, Plus, Send, Trash2, X } from "lucide-react";
import EmployeeAttendance from "@/frontend/features/attendance/components/EmployeeAttendance";
import { apiJson } from "@/frontend/lib/apiClient";
import EmployeeProjects from "@/frontend/features/projects/components/EmployeeProjects";
import EmployeeDashboard from "@/frontend/features/employee/components/EmployeeDashboard";
import EmployeePageHeader from "@/frontend/features/employee/components/EmployeePageHeader";
import { useAccess } from "@/frontend/contexts/AccessContext";
import { hasAnyPermission, hasPermission, PERMISSIONS } from "@/shared/permissions";

function Heading({ title, subtitle, action }) { return <EmployeePageHeader title={title} description={subtitle} action={action} />; }
function Pill({ status }) { const style = status === "Approved" || status === "Completed" || status === "On time" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : status === "Rejected" || status === "Blocked" ? "bg-rose-50 text-rose-700 border-rose-200" : status === "Pending" || status === "Needs Update" || status === "Late" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"; return <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${style}`}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{status}</span>; }
function Modal({ title, onClose, children }) { return <div className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950/50 p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><h2 className="text-xl font-bold">{title}</h2><button onClick={onClose}><X /></button></div><div className="mt-5">{children}</div></section></div>; }

function Home() {
  return <EmployeeDashboard />;
}

function Reports() {
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [taskItems, setTaskItems] = useState([]);

  const load = useCallback(
    () =>
      apiJson("/api/reports", { cache: "no-store" }).then(payload =>
        setItems(payload.data)
      ),
    []
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

      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
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

        <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-violet-700">
          <Send className="h-4 w-4" />
          Submit report
        </button>

        {message && (
          <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-700">
            {message}
          </p>
        )}
      </form>

      <h2 className="mt-8 text-base font-extrabold text-slate-950">
        Recent reports
      </h2>

      <div className="mt-3 space-y-3">
        {items.map(item => (
          <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200">
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
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => apiJson("/api/expenses", { cache: "no-store" }).then(payload => setItems(payload.data)), []);
  useEffect(() => { load(); }, [load]);
  async function submit(event) { event.preventDefault(); try { await apiJson("/api/expenses", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); setOpen(false); load(); } catch(error) { window.alert(error.message); } }
  const pending = items.filter(item => item.status === "Pending").reduce((sum, item) => sum + item.amount, 0); const approved = items.filter(item => item.status === "Approved").reduce((sum, item) => sum + item.amount, 0);
  return <>
    <Heading title="Expenses" subtitle="Submit field costs and follow every approval from one place." action={<button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-700"><Plus className="h-4 w-4" />New expense</button>} />
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-white to-amber-50 p-5 shadow-sm"><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-600">Pending approval</p><strong className="mt-3 block text-3xl tracking-tight text-slate-950">₹{pending.toLocaleString("en-IN")}</strong></div>
      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50 p-5 shadow-sm"><p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-600">Approved</p><strong className="mt-3 block text-3xl tracking-tight text-slate-950">₹{approved.toLocaleString("en-IN")}</strong></div>
    </div>
    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-extrabold text-slate-950">Expense history</h2></div>
      <div className="divide-y divide-slate-100">{items.map(item => <article className="flex items-center justify-between gap-4 p-5 transition hover:bg-slate-50/70" key={item.id}><div><strong className="text-slate-900">₹{item.amount.toLocaleString("en-IN")} · {item.type}</strong><p className="mt-1 text-sm text-slate-500">{item.date} · {item.note}</p>{item.managerComment && <p className="mt-2 text-xs font-medium text-violet-700">Manager: {item.managerComment}</p>}</div><Pill status={item.status} /></article>)}{!items.length && <p className="p-10 text-center text-sm text-slate-500">No expenses submitted yet.</p>}</div>
    </section>
    {open && <Modal title="New expense" onClose={() => setOpen(false)}><form onSubmit={submit} className="space-y-4"><label><span className="label">Type</span><select name="type" className="input"><option>Travel</option><option>Meals</option><option>Fuel</option><option>Materials</option><option>Tools</option></select></label><label><span className="label">Amount</span><input name="amount" type="number" min="1" required className="input" /></label><label><span className="label">Description</span><textarea name="note" required className="input min-h-24" /></label><button className="inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white hover:bg-violet-700">Submit expense</button></form></Modal>}
  </>;
}

function Tasks() {
  const [selected,setSelected]=useState(null); const [tasks,setTasks]=useState([]);
  useEffect(()=>{apiJson("/api/tasks",{cache:"no-store"}).then(payload=>setTasks(payload.data));},[]);
  async function update(id,status){const payload=await apiJson("/api/tasks",{method:"PATCH",body:JSON.stringify({id,status})});setTasks(current=>current.map(item=>item.id===id?payload.data:item));setSelected(payload.data);}
  return <>
    <Heading title="My tasks" subtitle="Review today’s assigned field work and update progress."/>
    <div className="grid gap-4 lg:grid-cols-2">{tasks.map(task=><button onClick={()=>setSelected(task)} key={task.id} className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-lg"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600"><MapPin className="h-5 w-5"/></span><div className="min-w-0"><h2 className="truncate font-extrabold text-slate-900">{task.title}</h2><p className="mt-1 truncate text-sm text-slate-500">{task.client} · {task.address}</p><div className="mt-2"><Pill status={task.status}/></div></div><ChevronRight className="ml-auto h-5 w-5 shrink-0 text-slate-300"/></button>)}{!tasks.length && <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No tasks are assigned to you.</div>}</div>
    {selected&&<Modal title={selected.title} onClose={()=>setSelected(null)}><p className="text-slate-500">{selected.client}</p><p className="mt-3 flex items-center gap-2"><MapPin className="h-4 w-4 text-violet-600"/>{selected.address}</p><div className="mt-4"><Pill status={selected.status}/></div><div className="mt-5 flex flex-wrap gap-2">{["On The Way","In Progress","Completed","Blocked"].map(status=><button key={status} onClick={()=>update(selected.id,status)} className="btn-secondary text-sm">{status}</button>)}</div><a className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white hover:bg-violet-700" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(selected.address)}`}>Open directions</a></Modal>}
  </>;
}

function Profile() {
  const access = useAccess();
  const router = useRouter();
  const inputRef = useRef(null);
  const name = access?.profile?.full_name || "FieldFlow user";
  const [avatarUrl, setAvatarUrl] = useState(access?.profile?.avatarUrl || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function publishAvatar(nextUrl) {
    setAvatarUrl(nextUrl || "");
    window.dispatchEvent(new CustomEvent("fieldflow:profile-avatar", { detail: { avatarUrl: nextUrl || null } }));
  }

  async function uploadAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const form = new FormData();
      form.append("avatar", file);
      const payload = await apiJson("/api/profile/avatar", { method: "POST", body: form });
      publishAvatar(payload.data.avatarUrl);
      setMessage(avatarUrl ? "Profile photo updated." : "Profile photo uploaded.");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    if (!avatarUrl || busy || !window.confirm("Remove your current profile photo?")) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await apiJson("/api/profile/avatar", { method: "DELETE" });
      publishAvatar(null);
      setMessage("Profile photo removed.");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Heading title="My profile" subtitle="Your FieldFlow employee account and organisation details." />
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="h-28 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-500" />
      <div className="px-6 pb-7 text-center">
        <div className="relative mx-auto -mt-12 h-24 w-24">
          <div role={avatarUrl ? "img" : undefined} aria-label={avatarUrl ? `${name} profile photo` : undefined} style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined} className={`grid h-24 w-24 place-items-center rounded-full border-4 border-white bg-slate-950 bg-cover bg-center text-3xl font-extrabold text-white shadow-lg ${avatarUrl ? "text-transparent" : ""}`}>{name.charAt(0).toUpperCase()}</div>
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} aria-label={avatarUrl ? "Change profile photo" : "Upload profile photo"} className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-violet-600 text-white shadow-md transition hover:bg-violet-700 disabled:opacity-50"><Camera className="h-4 w-4" /></button>
          <input ref={inputRef} onChange={uploadAvatar} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" />
        </div>
        <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-950">{name}</h2>
        <p className="mt-1 text-sm text-slate-500">{access?.profile?.email}</p>
        <p className="mt-2 text-xs text-slate-400">JPEG, PNG, or WebP · maximum 5 MB</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"><Camera className="h-4 w-4" />{busy ? "Saving…" : avatarUrl ? "Change photo" : "Upload photo"}</button>
          {avatarUrl && <button type="button" disabled={busy} onClick={removeAvatar} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-4 w-4" />Remove</button>}
        </div>
        {message && <p role="status" className="mx-auto mt-4 max-w-md rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">{message}</p>}
        {error && <p role="alert" className="mx-auto mt-4 max-w-md rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700">{error}</p>}
        <div className="mx-auto mt-5 grid max-w-xl gap-3 text-left sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Role</p><strong className="mt-1 block text-sm text-slate-900">{access?.role?.name || "Workspace member"}</strong></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Department</p><strong className="mt-1 block text-sm text-slate-900">{access?.profile?.department || "Not assigned"}</strong></div></div>
        <button onClick={() => router.push("/employee/expenses")} className="mt-6 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:border-violet-200 hover:text-violet-700">View expenses</button>
      </div>
    </section>
  </>;
}

function EmployeeWork({ access }) {
  return <div>
    <EmployeePageHeader title="My work" description="Projects, assigned tasks, deadlines, and progress in one place." />
    <div className="space-y-10">
      {hasPermission(access, PERMISSIONS.projectsViewSelf) && <div className="[&>div:first-child]:hidden"><EmployeeProjects /></div>}
      {hasPermission(access, PERMISSIONS.tasksViewSelf) && <div className="[&>header:first-child]:hidden"><Tasks /></div>}
    </div>
  </div>;
}

export default function EmployeeWorkspace({ section }) {
  const access = useAccess();
  const content = useMemo(() => {
    if (!access) return null;
    if (!section) {
      if (hasPermission(access, PERMISSIONS.dashboardView)) return <Home />;
      if (hasAnyPermission(access, [PERMISSIONS.projectsViewSelf, PERMISSIONS.tasksViewSelf])) return <EmployeeWork access={access} />;
      if (hasPermission(access, PERMISSIONS.attendanceViewSelf)) return <EmployeeAttendance />;
      return <Profile />;
    }
    if (section === "tasks" && hasAnyPermission(access, [PERMISSIONS.projectsViewSelf, PERMISSIONS.tasksViewSelf])) return <EmployeeWork access={access} />;
    if (section === "attendance" && hasPermission(access, PERMISSIONS.attendanceViewSelf)) return <EmployeeAttendance />;
    if (section === "reports" && hasPermission(access, PERMISSIONS.reportsSubmit)) return <Reports />;
    if (section === "expenses" && hasPermission(access, PERMISSIONS.expensesSubmit)) return <Expenses />;
    if (section === "profile") return <Profile />;
    return <section className="card p-10 text-center"><h1 className="text-xl font-bold">Module not available</h1><p className="mt-2 text-slate-500">Your assigned role does not include permission for this module.</p></section>;
  }, [access, section]);
  return content;
}
