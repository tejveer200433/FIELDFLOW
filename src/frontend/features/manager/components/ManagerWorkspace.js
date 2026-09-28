"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Archive, ArchiveRestore, CalendarClock, Download, MapPin, Pencil, Plus, Search, ShieldCheck, UserPlus } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import LiveTeamMap from "@/frontend/components/maps/LiveTeamMap";
import ManagerAttendance from "@/frontend/features/attendance/components/ManagerAttendance";
import { activity, managerEmployees, managerTasks } from "@/frontend/features/manager/data/managerData";
import { apiJson, authenticatedFetch } from "@/frontend/lib/apiClient";
import EmployeeDirectory from "@/frontend/features/employees/components/EmployeeDirectory";
import ProjectManagement from "@/frontend/features/projects/components/ProjectManagement";
import AttendanceLocations from "@/frontend/features/attendance/components/AttendanceLocations";
import RolesPermissionsSettings from "@/frontend/features/rbac/components/RolesPermissionsSettings";
import TaskCollaboration from "@/frontend/features/tasks/components/TaskCollaboration";
import ExpenseReceipt from "@/frontend/features/expenses/components/ExpenseReceipt";
import ManagerDashboard from "@/frontend/features/dashboard/components/ManagerDashboard";
import AdminDashboard from "@/frontend/features/dashboard/components/AdminDashboard";
import Modal from "@/frontend/components/ui/Modal";
import PageHeading from "@/frontend/components/ui/PageHeading";
import Pill, { toneFor } from "@/frontend/components/ui/StatusPill";
import { useAccess } from "@/frontend/contexts/AccessContext";
import { hasAnyPermission, hasPermission, PERMISSIONS } from "@/shared/permissions";

const weekly = [
  { day: "Mon", tasks: 32 }, { day: "Tue", tasks: 41 }, { day: "Wed", tasks: 38 }, { day: "Thu", tasks: 47 },
  { day: "Fri", tasks: 52 }, { day: "Sat", tasks: 28 }, { day: "Sun", tasks: 14 }
];
const hours = [{ name: "Aarav", value: 9 }, { name: "Neha", value: 8 }, { name: "Rohit", value: 7 }, { name: "Simran", value: 7 }, { name: "Vikram", value: 7 }, { name: "Anjali", value: 7 }];
const throughput = Array.from({ length: 14 }, (_, index) => ({ day: `D${index + 1}`, tasks: [19, 21, 26, 19, 17, 12, 19, 23, 28, 25, 18, 10, 14, 22][index], sla: [98, 92, 94, 95, 95, 94, 93, 94, 95, 93, 91, 93, 98, 95][index] }));
const performance = managerEmployees.map(employee => ({ name: employee.name.split(" ")[0], value: employee.performance }));
const taskMix = [{ name: "Installation", value: 42, color: "#3b82f6" }, { name: "Maintenance", value: 28, color: "#10b981" }, { name: "Audit", value: 18, color: "#8b5cf6" }, { name: "Repair", value: 12, color: "#f59e0b" }];
const columns = ["Assigned", "On The Way", "In Progress", "Completed", "Blocked"];
const defaultWorkflow = [
  { id: "Assigned", label: "Assigned", color: "#64748b", order: 0 },
  { id: "On The Way", label: "On The Way", color: "#8b5cf6", order: 1 },
  { id: "In Progress", label: "In Progress", color: "#3b82f6", order: 2 },
  { id: "Completed", label: "Completed", color: "#10b981", order: 3 },
  { id: "Blocked", label: "Blocked", color: "#f43f5e", order: 4 }
];
const taskHistoryFields = [
  ["title", "Title"], ["client", "Client"], ["address", "Address"], ["priority", "Priority"],
  ["status", "Status"], ["scheduled_at", "Schedule"], ["description", "Description"], ["archived_at", "Archived"]
];

function dateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function describeTaskHistory(entry) {
  if (entry.action === "created") return ["Task created"];
  const before = entry.changes?.before || {};
  const after = entry.changes?.after || {};
  return taskHistoryFields
    .filter(([field]) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null))
    .map(([field, label]) => `${label}: ${before[field] || "None"} → ${after[field] || "None"}`);
}
function Employees() {
  const pathname = usePathname();
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const filtered = items.filter(item => `${item.name} ${item.department} ${item.email}`.toLowerCase().includes(query.toLowerCase()));
  const isAdmin = pathname.startsWith("/admin");
  useEffect(() => { apiJson("/api/employees").then(payload => setItems(payload.data.map(item => ({...item,duty:"Offline",tasks:0,performance:0,avatar:`https://i.pravatar.cc/96?u=${encodeURIComponent(item.email)}`})))); }, []);
  function add(event) { event.preventDefault(); setAdding(false); window.alert("Ask the employee to sign up, then approve the account from the administrator workspace."); }
  async function decideAccount(item,approvalStatus){const payload=await apiJson("/api/employees",{method:"PATCH",body:JSON.stringify({id:item.id,approvalStatus,role:item.requestedRole})});setItems(current=>current.map(profile=>profile.id===item.id?{...profile,...payload.data}:profile));}
  return <>
    <PageHeading title="Employees" subtitle={`${items.length} technicians across 4 departments`} action={<button onClick={() => setAdding(true)} className="btn-primary rounded-full px-7 py-4 text-base"><UserPlus className="h-5 w-5" />Add employee</button>} />
    {isAdmin&&items.some(item=>item.approvalStatus==="pending")&&<section className="card mb-5 p-5"><h2 className="font-bold">Pending account approvals</h2><div className="mt-3 space-y-3">{items.filter(item=>item.approvalStatus==="pending").map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 p-4"><div><strong>{item.name}</strong><p className="text-sm text-slate-600">{item.email} · requests {item.requestedRole}</p></div><div className="flex gap-2"><button onClick={()=>decideAccount(item,"approved")} className="btn-primary">Approve</button><button onClick={()=>decideAccount(item,"rejected")} className="btn-secondary">Reject</button></div></div>)}</div></section>}
    <div className="card p-5"><label className="relative block"><Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} className="input py-4 pl-12" placeholder="Search by name or department" /></label><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left"><thead><tr className="text-xs uppercase tracking-widest text-slate-500"><th className="py-4">Employee</th><th>Department</th><th>Status</th><th>Tasks</th><th>Performance</th><th /></tr></thead><tbody>{filtered.map(employee => <tr key={employee.id} className="border-t"><td className="py-3"><div className="flex items-center gap-3"><img src={employee.avatar} alt="" className="h-11 w-11 rounded-full object-cover" /><div><p className="font-bold">{employee.name}</p><p className="text-xs text-slate-500">{employee.email}</p></div></div></td><td className="pr-6">{employee.department}</td><td className="pr-6"><Pill tone={toneFor(employee.duty)}>{employee.duty}</Pill></td><td>{employee.tasks}</td><td><div className="flex items-center gap-3"><span className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100"><span className="block h-full bg-blue-500" style={{ width: `${employee.performance}%` }} /></span><strong className="text-sm">{employee.performance}%</strong></div></td><td><button onClick={() => setSelected(employee)} className="font-bold text-blue-600">View →</button></td></tr>)}</tbody></table>{!filtered.length && <p className="py-12 text-center text-slate-500">No employees match your search.</p>}</div></div>
    {adding && <Modal title="Add employee" onClose={() => setAdding(false)}><form onSubmit={add} className="space-y-4"><label><span className="label">Full name</span><input name="name" required className="input" /></label><label><span className="label">Email</span><input name="email" type="email" required className="input" /></label><label><span className="label">Department</span><select name="department" className="input"><option>Field Operations</option><option>Installations</option><option>Maintenance</option><option>Repairs</option></select></label><button className="btn-primary w-full">Add employee</button></form></Modal>}
    {selected && <Modal title="Employee details" onClose={() => setSelected(null)}><div className="text-center"><img src={selected.avatar} alt="" className="mx-auto h-24 w-24 rounded-full object-cover" /><h3 className="mt-4 text-xl font-bold">{selected.name}</h3><p className="text-slate-500">{selected.email}</p></div><dl className="mt-6 grid grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-5 text-sm"><div><dt className="text-slate-500">Department</dt><dd className="mt-1 font-bold">{selected.department}</dd></div><div><dt className="text-slate-500">Current status</dt><dd className="mt-1"><Pill tone={toneFor(selected.duty)}>{selected.duty}</Pill></dd></div><div><dt className="text-slate-500">Tasks</dt><dd className="mt-1 font-bold">{selected.tasks}</dd></div><div><dt className="text-slate-500">Performance</dt><dd className="mt-1 font-bold">{selected.performance}%</dd></div></dl></Modal>}
  </>;
}

function TaskPlanner({ items, employees, workflow, view, onDrop, onOpen, archived = false }) {
  if (view === "timeline") {
    const scheduled = [...items].sort((a, b) => {
      if (!a.scheduledAt) return 1;
      if (!b.scheduledAt) return -1;
      return new Date(a.scheduledAt) - new Date(b.scheduledAt);
    });
    return <section className="card overflow-hidden"><div className="divide-y divide-slate-100">{scheduled.map(task => <article key={task.id} className="grid gap-3 p-5 sm:grid-cols-[170px_1fr_auto] sm:items-center"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{task.scheduledAt ? new Date(task.scheduledAt).toLocaleDateString() : "Unscheduled"}</p><p className="mt-1 text-sm font-semibold text-slate-700">{task.scheduledAt ? new Date(task.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Add a date"}</p></div><div><h3 className="font-bold text-slate-900">{task.title}</h3><p className="mt-1 text-sm text-slate-500">{task.employee} · {task.client}</p></div><button type="button" onClick={() => onOpen(task)} className="btn-secondary text-xs">Details</button></article>)}{!scheduled.length && <p className="p-10 text-center text-sm text-slate-500">No tasks to schedule.</p>}</div></section>;
  }
  if (view === "workload") {
    const workload = employees.map(employee => {
      const assigned = items.filter(task => (task.employeeIds || [task.employeeId]).includes(employee.id) && task.status !== "Completed");
      return { ...employee, assigned, estimated: assigned.reduce((sum, task) => sum + (task.estimatedMinutes || 0), 0), tracked: assigned.reduce((sum, task) => sum + (task.actualMinutes || 0), 0) };
    }).sort((a, b) => b.estimated - a.estimated || b.assigned.length - a.assigned.length);
    const maximum = Math.max(1, ...workload.map(item => item.estimated));
    return <div className="grid gap-4 lg:grid-cols-2">{workload.map(employee => <article key={employee.id} className="card p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="font-bold text-slate-900">{employee.name}</h3><p className="mt-1 text-sm text-slate-500">{employee.assigned.length} open task{employee.assigned.length === 1 ? "" : "s"}</p></div><strong className="text-sm text-blue-700">{Math.round(employee.estimated / 60 * 10) / 10}h planned</strong></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500" style={{ width: `${Math.max(employee.estimated ? 8 : 0, employee.estimated / maximum * 100)}%` }} /></div><p className="mt-3 text-xs text-slate-500">{employee.tracked} minutes tracked across current tasks</p></article>)}{!workload.length && <p className="card p-10 text-center text-sm text-slate-500">No approved employees are available.</p>}</div>;
  }
  return <div className="grid gap-4 overflow-x-auto xl:grid-cols-5">{workflow.map(column => { const columnItems = items.filter(item => item.status === column.id); return <section key={column.id} onDragOver={archived ? undefined : event => event.preventDefault()} onDrop={archived ? undefined : event => onDrop(event, column.id)} className="min-h-[500px] min-w-[250px] rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 p-4"><div className="mb-4 flex items-center gap-3"><span className="inline-flex rounded-full px-3 py-1 text-xs font-bold text-white" style={{ backgroundColor: column.color }}>{column.label}</span><span className="text-sm font-bold text-slate-500">{columnItems.length}</span></div><div className="space-y-3">{columnItems.map(task => <article draggable={!archived} onDragStart={archived ? undefined : event => event.dataTransfer.setData("text/plain", task.id)} key={task.id} className={`${archived ? "" : "cursor-grab active:cursor-grabbing"} rounded-2xl border border-slate-200 bg-white p-4 shadow-sm`}><div className="flex items-start justify-between gap-2"><h3 className="truncate font-bold" title={task.title}>{task.title}</h3><Pill tone={toneFor(task.priority)}>{task.priority}</Pill></div><p className="mt-2 text-sm text-slate-500">{task.client}</p><p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" />{task.address}</p>{task.scheduledAt && <p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><CalendarClock className="h-3.5 w-3.5" />{new Date(task.scheduledAt).toLocaleString()}</p>}<div className="mt-4 flex items-center justify-between gap-3"><p className="line-clamp-2 text-sm font-medium">{task.employee}</p><button type="button" onClick={() => onOpen(task)} className="shrink-0 text-xs font-bold text-blue-600"><Pencil className="mr-1 inline h-3.5 w-3.5" />Details</button></div></article>)}</div></section>; })}</div>;
}

function WorkflowForm({ workflow, onClose, onSave }) {
  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave(columns.map(id => ({ id, label: String(form.get(`${id}:label`) || id), color: String(form.get(`${id}:color`) || "#64748b"), order: Number(form.get(`${id}:order`)) })).sort((a, b) => a.order - b.order));
  }
  return <Modal title="Customize task workflow" onClose={onClose}><form onSubmit={submit} className="space-y-3"><p className="text-sm text-slate-500">Rename, recolor, or reorder the five stable workflow stages. Task automation continues using their canonical states.</p>{workflow.map(column => <div key={column.id} className="grid grid-cols-[1fr_76px_72px] items-end gap-3 rounded-xl bg-slate-50 p-3"><label><span className="label">{column.id}</span><input name={`${column.id}:label`} defaultValue={column.label} maxLength={40} required className="input bg-white" /></label><label><span className="label">Color</span><input name={`${column.id}:color`} type="color" defaultValue={column.color} className="h-11 w-full rounded-lg border border-slate-200 bg-white p-1" /></label><label><span className="label">Order</span><input name={`${column.id}:order`} type="number" min="0" max="4" defaultValue={column.order} required className="input bg-white" /></label></div>)}<button className="btn-primary w-full">Save workflow</button></form></Modal>;
}

function TaskDetails({ task, employees, onClose, onSave, onArchive, financials, onSaveFinancials, history, historyMessage }) {
  return <Modal title="Task details" onClose={onClose}>
    {task.archived && <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><strong>Archived task</strong><p className="mt-1">This task is read-only and hidden from employee work queues. Restore it before making changes.</p></div>}
    {!task.archived && <form onSubmit={onSave} className="space-y-4">
      <label><span className="label">Task title</span><input name="title" defaultValue={task.title} required className="input" /></label>
      <label><span className="label">Employees</span><select name="employeeIds" multiple required defaultValue={task.employeeIds || [task.employeeId]} className="input min-h-28">{employees.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select><span className="mt-1 block text-xs text-slate-500">Hold Ctrl (Windows) or Command (Mac) to select multiple employees.</span></label>
      <div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Client</span><input name="client" defaultValue={task.client} required className="input" /></label><label><span className="label">Priority</span><select name="priority" defaultValue={task.priority} className="input"><option>Low</option><option>Medium</option><option>High</option><option>Urgent</option></select></label></div>
      <label><span className="label">Site/address</span><input name="address" defaultValue={task.address} required className="input" /></label>
      <label><span className="label">Scheduled for</span><input name="scheduledAt" type="datetime-local" defaultValue={dateTimeInput(task.scheduledAt)} className="input" /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Estimated minutes</span><input name="estimatedMinutes" type="number" min="1" max="100800" defaultValue={task.estimatedMinutes || ""} className="input" /></label><label><span className="label">Repeat</span><select name="recurrence" defaultValue={task.recurrence || "none"} className="input"><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label></div>
      <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800"><strong>Tracked:</strong> {task.actualMinutes || 0} minutes{task.estimatedMinutes ? ` of ${task.estimatedMinutes} estimated` : ""}</p>
      <label><span className="label">Description</span><textarea name="description" defaultValue={task.description || ""} className="input min-h-24" /></label>
      <label><span className="label">Checklist (one item per line)</span><textarea name="checklistText" defaultValue={(task.checklist || []).map(item => item.text).join("\n")} className="input min-h-28" /></label>
      <button className="btn-primary w-full">Save task</button>
    </form>}
    <button type="button" onClick={() => onArchive(task)} className={`btn-secondary mt-4 w-full ${task.archived ? "text-emerald-700" : "text-rose-700"}`}>{task.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}{task.archived ? "Restore task" : "Archive task"}</button>
    {!task.archived && financials && <form onSubmit={onSaveFinancials} className="mt-6 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="font-bold text-amber-950">Management financials</h3><div className="grid gap-3 sm:grid-cols-3"><label><span className="label">Currency</span><input name="currency" maxLength={3} defaultValue={financials.currency} className="input bg-white" /></label><label><span className="label">Budget</span><input name="budgetAmount" type="number" min="0" step="0.01" defaultValue={financials.budgetAmount ?? ""} className="input bg-white" /></label><label><span className="label">Hourly cost</span><input name="hourlyCost" type="number" min="0" step="0.01" defaultValue={financials.hourlyCost ?? ""} className="input bg-white" /></label></div><p className="text-sm text-amber-900">Actual: {financials.currency} {financials.actualCost.toFixed(2)} · Remaining: {financials.remainingBudget == null ? "No budget" : `${financials.currency} ${financials.remainingBudget.toFixed(2)}`}</p><button className="btn-secondary">Save financials</button></form>}
    {!task.archived && <TaskCollaboration taskId={task.id} />}
    <section className="mt-6 border-t border-slate-200 pt-5"><h3 className="font-bold">Change history</h3>{historyMessage && <p className="mt-3 text-sm text-slate-500">{historyMessage}</p>}<div className="mt-3 space-y-3">{history.map(entry => <article key={entry.id} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex justify-between gap-3"><strong>{entry.actor || "System"}</strong><span className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</span></div>{describeTaskHistory(entry).map(change => <p key={change} className="mt-1 text-xs text-slate-600">{change}</p>)}</article>)}</div></section>
  </Modal>;
}

function TaskBoard() {
  const [items, setItems] = useState([]);
  const [adding, setAdding] = useState(false);
  const [employees,setEmployees]=useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyMessage, setHistoryMessage] = useState("");
  const [financials, setFinancials] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState("board");
  const [taskView, setTaskView] = useState("active");
  const [workflow, setWorkflow] = useState(defaultWorkflow);
  const [configuringWorkflow, setConfiguringWorkflow] = useState(false);
  const managerEmployees = employees.length ? employees : [{ id: "", name: "No approved employees yet" }];
  useEffect(()=>{Promise.all([apiJson(`/api/tasks?view=${taskView}`),apiJson("/api/employees")]).then(([taskPayload,employeePayload])=>{setItems(taskPayload.data);setEmployees(employeePayload.data.filter(item=>item.approvalStatus==="approved"));setError("");}).catch(failure=>setError(failure.message));},[taskView]);
  useEffect(()=>{apiJson("/api/task-board-preferences").then(payload=>setWorkflow(payload.data)).catch(()=>{});},[]);
  async function drop(event, status) { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); try { const payload=await apiJson("/api/tasks",{method:"PATCH",body:JSON.stringify({id,status})}); setItems(current => current.map(item => item.id === id ? payload.data : item)); setError(""); } catch (failure) { setError(failure.message); } }
  async function add(event) { event.preventDefault(); const form = new FormData(event.currentTarget); const data = Object.fromEntries(form); data.employeeIds = form.getAll("employeeIds"); data.employeeId = data.employeeIds[0]; if(!data.employeeId){setError("Create or approve an employee account before assigning a task.");return;} if(data.scheduledAt) data.scheduledAt = new Date(data.scheduledAt).toISOString(); try{const payload=await apiJson("/api/tasks",{method:"POST",body:JSON.stringify(data)});setItems(current=>[payload.data,...current]);setAdding(false);setError("");}catch(failure){setError(failure.message);} }
  async function openTask(task) {
    setSelected(task);
    setHistory([]);
    setFinancials(null);
    setHistoryMessage("Loading history…");
    try {
      const [historyPayload, financialPayload] = await Promise.all([
        apiJson(`/api/tasks/${task.id}/history`, { cache: "no-store" }),
        apiJson(`/api/task-financials?taskId=${encodeURIComponent(task.id)}`, { cache: "no-store" })
      ]);
      setHistory(historyPayload.data || []);
      setFinancials(financialPayload.data);
      setHistoryMessage(historyPayload.data?.length ? "" : "No task changes have been recorded yet.");
    } catch (failure) {
      setHistoryMessage(failure.message);
    }
  }
  async function saveFinancials(event) {
    event.preventDefault();
    try {
      const payload = await apiJson("/api/task-financials", { method: "PUT", body: JSON.stringify({ taskId: selected.id, ...Object.fromEntries(new FormData(event.currentTarget)) }) });
      setFinancials(payload.data);
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }
  async function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = Object.fromEntries(form);
    data.employeeIds = form.getAll("employeeIds");
    if (!data.employeeIds.length) delete data.employeeIds;
    const previousChecklist = selected.checklist || [];
    const checklist = String(data.checklistText || "").split(/\r?\n/).map(value => value.trim()).filter(Boolean).map((text, index) => ({ id: previousChecklist[index]?.id, text, completed: previousChecklist[index]?.text === text && previousChecklist[index]?.completed }));
    delete data.checklistText;
    try {
      const payload = await apiJson("/api/tasks", { method: "PATCH", body: JSON.stringify({ ...data, checklist, id: selected.id, scheduledAt: data.scheduledAt ? new Date(data.scheduledAt).toISOString() : "" }) });
      setItems(current => current.map(item => item.id === selected.id ? payload.data : item));
      await openTask(payload.data);
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }
  async function toggleArchive(task) {
    const restoring = task.archived;
    if (!window.confirm(`${restoring ? "Restore" : "Archive"} “${task.title}”? ${restoring ? "It will return to employee work queues." : "It will become read-only and leave employee work queues."}`)) return;
    try {
      await apiJson("/api/tasks", { method: "PATCH", body: JSON.stringify({ id: task.id, archived: !restoring }) });
      setItems(current => current.filter(item => item.id !== task.id));
      setSelected(null);
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }
  async function saveWorkflow(columnsToSave) {
    try {
      const payload = await apiJson("/api/task-board-preferences", { method: "PUT", body: JSON.stringify({ columns: columnsToSave }) });
      setWorkflow(payload.data);
      setConfiguringWorkflow(false);
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }
  return <><PageHeading title="Task planning" subtitle="Manage task workflow, schedule, and employee capacity." action={<button onClick={() => setAdding(true)} className="btn-primary rounded-full px-7 py-4 text-base"><Plus className="h-5 w-5" />Assign task</button>} />
    {error && <p className="mb-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>}
    <div className="mb-3 flex w-fit gap-1 rounded-xl border border-slate-200 bg-white p-1"><button type="button" onClick={() => { setTaskView("active"); setSelected(null); }} className={taskView === "active" ? "btn-primary rounded-lg" : "btn-secondary rounded-lg"}>Active tasks</button><button type="button" onClick={() => { setTaskView("archived"); setSelected(null); }} className={taskView === "archived" ? "btn-primary rounded-lg" : "btn-secondary rounded-lg"}>Archived tasks</button></div>
    <div className="mb-5 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2">{[["board","Board"],["timeline","Timeline"],["workload","Workload"]].map(([id,label]) => <button type="button" key={id} onClick={() => setView(id)} className={view === id ? "btn-primary rounded-xl" : "btn-secondary rounded-xl"}>{label}</button>)}<button type="button" onClick={() => setConfiguringWorkflow(true)} className="btn-secondary ml-auto rounded-xl">Customize workflow</button></div>
    <TaskPlanner items={items} employees={employees} workflow={workflow} view={view} onDrop={drop} onOpen={openTask} archived={taskView === "archived"} />
    {configuringWorkflow && <WorkflowForm workflow={workflow} onClose={() => setConfiguringWorkflow(false)} onSave={saveWorkflow} />}
    {adding && <Modal title="Assign task" onClose={() => setAdding(false)}><form onSubmit={add} className="space-y-4"><label><span className="label">Task title</span><input name="title" required className="input" /></label><label><span className="label">Employees</span><select name="employeeIds" multiple required className="input min-h-28">{managerEmployees.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select><span className="mt-1 block text-xs text-slate-500">Hold Ctrl (Windows) or Command (Mac) to select multiple employees.</span></label><label><span className="label">Client</span><input name="client" required className="input" /></label><label><span className="label">Site/address</span><input name="address" required className="input" /></label><label><span className="label">Scheduled for</span><input name="scheduledAt" type="datetime-local" className="input" /></label><label><span className="label">Description</span><textarea name="description" className="input min-h-24" /></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Estimated minutes</span><input name="estimatedMinutes" type="number" min="1" max="100800" className="input" /></label><label><span className="label">Repeat</span><select name="recurrence" className="input"><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label></div><label><span className="label">Priority</span><select name="priority" className="input"><option>Low</option><option>Medium</option><option>High</option><option>Urgent</option></select></label><button className="btn-primary w-full">Create assignment</button></form></Modal>}
    {selected && <TaskDetails task={selected} employees={managerEmployees} onClose={() => setSelected(null)} onSave={save} onArchive={toggleArchive} financials={financials} onSaveFinancials={saveFinancials} history={history} historyMessage={historyMessage} />}
  </>;
}

function Analytics() {
  const [analyticsData,setAnalyticsData]=useState({tasks:[],employees:[]});
  useEffect(()=>{Promise.all([apiJson("/api/tasks"),apiJson("/api/employees")]).then(([taskResult,employeeResult])=>setAnalyticsData({tasks:taskResult.data,employees:employeeResult.data}));},[]);
  const taskMix=["Assigned","On The Way","In Progress","Completed","Blocked"].map((name,index)=>({name,value:analyticsData.tasks.filter(item=>item.status===name).length,color:["#64748b","#8b5cf6","#3b82f6","#10b981","#f43f5e"][index]})).filter(item=>item.value);
  const performance=analyticsData.employees.map(employee=>{const assigned=analyticsData.tasks.filter(task=>task.employeeId===employee.id);return{name:employee.name.split(" ")[0],value:assigned.length?Math.round(assigned.filter(task=>task.status==="Completed").length/assigned.length*100):0};});
  const throughput=Array.from({length:14},(_,offset)=>{const date=new Date();date.setDate(date.getDate()-(13-offset));const key=date.toISOString().slice(0,10);const changed=analyticsData.tasks.filter(item=>item.updatedAt?.slice(0,10)===key);const done=changed.filter(item=>item.status==="Completed").length;return{day:`D${offset+1}`,tasks:done,sla:changed.length?Math.round(done/changed.length*100):100};});
  return <><PageHeading title="Analytics" subtitle="Performance, throughput and SLA insights." /><div className="grid gap-7 xl:grid-cols-[2fr_1fr]"><div className="card p-6"><h2 className="font-bold">Throughput & SLA (14 days)</h2><div className="mt-4 h-72"><ResponsiveContainer><LineChart data={throughput}><CartesianGrid stroke="#e8edf5" vertical={false} /><XAxis dataKey="day" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} /><Tooltip /><Legend /><Line name="Tasks done" dataKey="tasks" stroke="#3b82f6" strokeWidth={2.5} /><Line name="SLA %" dataKey="sla" stroke="#10b981" strokeWidth={2.5} /></LineChart></ResponsiveContainer></div></div><div className="card p-6"><h2 className="font-bold">Task mix</h2><div className="h-72"><ResponsiveContainer><PieChart><Pie data={taskMix} dataKey="value" nameKey="name" innerRadius={62} outerRadius={100} paddingAngle={3}>{taskMix.map(item => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div></div></div><div className="card mt-7 p-6"><h2 className="font-bold">Employee performance</h2><div className="mt-4 h-72"><ResponsiveContainer><BarChart data={performance}><CartesianGrid stroke="#e8edf5" vertical={false} /><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="value" fill="#2563eb" radius={[10, 10, 0, 0]} /></BarChart></ResponsiveContainer></div></div></>;
}

function Reports({ access }) {
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ status: "", employeeId: "", teamId: "", taskId: "", from: "", to: "" });
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [comments, setComments] = useState({});
  const [offset, setOffset] = useState(0);
  const [pagination, setPagination] = useState({ limit: 50, offset: 0, hasMore: false });
  const [summary, setSummary] = useState({ totalReports: 0, totalHours: 0, submitted: 0, approved: 0, needsUpdate: 0, rejected: 0 });
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportingPayroll, setExportingPayroll] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const teams = useMemo(() => {
    const values = employees.flatMap(employee => employee.teams || []);
    return [...new Map(values.map(team => [team.id, team])).values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);
  const filteredEmployees = filters.teamId
    ? employees.filter(employee => employee.teams?.some(team => team.id === filters.teamId))
    : employees;
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const params = new URLSearchParams({ limit: "50", offset: String(offset) });
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    try {
      const payload = await apiJson(`/api/reports?${params}`, { cache: "no-store" });
      setItems(payload.data || []);
      setPagination(payload.pagination || { limit: 50, offset, hasMore: false });
      setSummary(payload.summary || { totalReports: 0, totalHours: 0, submitted: 0, approved: 0, needsUpdate: 0, rejected: 0 });
      setError("");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [filters, offset]);
  useEffect(() => {
    Promise.allSettled([
      apiJson("/api/employees", { cache: "no-store" }),
      apiJson("/api/tasks", { cache: "no-store" }),
      apiJson("/api/report-presets", { cache: "no-store" })
    ]).then(([employeeResult, taskResult, presetResult]) => {
      if (employeeResult.status === "fulfilled") setEmployees((employeeResult.value.data || []).filter(employee => employee.approvalStatus === "approved"));
      if (taskResult.status === "fulfilled") setTasks(taskResult.value.data || []);
      if (presetResult.status === "fulfilled") setPresets(presetResult.value.data || []);
    });
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30000);
    return () => clearInterval(timer);
  }, [load]);
  function updateFilter(key, value) {
    setOffset(0);
    setFilters(current => ({ ...current, [key]: value, ...(key === "teamId" ? { employeeId: "" } : {}) }));
  }
  function resetFilters() {
    setOffset(0);
    setFilters({ status: "", employeeId: "", teamId: "", taskId: "", from: "", to: "" });
  }
  async function exportCsv() {
    setExporting(true);
    setError("");
    const params = new URLSearchParams({ format: "csv" });
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    try {
      const response = await authenticatedFetch(`/api/reports?${params}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "The report export failed.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `fieldflow-reports-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setExporting(false);
    }
  }
  async function exportPayrollCsv() {
    setExportingPayroll(true);
    setError("");
    const params = new URLSearchParams();
    for (const key of ["employeeId", "teamId", "from", "to"]) {
      if (filters[key]) params.set(key, filters[key]);
    }
    try {
      const response = await authenticatedFetch(`/api/timesheets?${params}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "The payroll export failed.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `fieldflow-payroll-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setExportingPayroll(false);
    }
  }
  async function savePreset(kind) {
    const name = window.prompt(kind === "view" ? "Name this report view" : "Name this report schedule");
    if (!name) return;
    let recipientEmail;
    let frequency;
    if (kind === "schedule") {
      recipientEmail = window.prompt("Recipient email address") || "";
      frequency = window.prompt("Delivery frequency: daily, weekly, or monthly", "weekly") || "";
    }
    try {
      const payload = await apiJson("/api/report-presets", { method: "POST", body: JSON.stringify({ name, kind, filters, recipientEmail, frequency: frequency.toLowerCase() }) });
      setPresets(current => [payload.data, ...current]);
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }
  function applyPreset(id) {
    const preset = presets.find(item => item.id === id);
    if (!preset) return;
    setOffset(0);
    setFilters(current => ({ ...current, ...preset.filters }));
  }
  async function decide(id, status) { await apiJson("/api/reports", { method: "PATCH", body: JSON.stringify({ id, status, managerComment: comments[id] || (status === "Approved" ? "Approved by manager." : "Please review the manager decision.") }) }); load(); }
  return <><PageHeading title="Daily reports" subtitle="Filter and review employee updates within your permitted scope." />
    <section className="card mb-5 p-5">
      <div className="mb-4 flex flex-wrap items-end gap-3"><label className="min-w-56 flex-1"><span className="label">Saved view or schedule</span><select className="input" defaultValue="" onChange={event => applyPreset(event.target.value)}><option value="">Choose a saved preset</option>{presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name} · {preset.kind}</option>)}</select></label><button type="button" className="btn-secondary" onClick={() => savePreset("view")}>Save view</button><button type="button" className="btn-secondary" onClick={() => savePreset("schedule")}>Create schedule</button></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <label><span className="label">Team</span><select className="input" value={filters.teamId} onChange={event => updateFilter("teamId", event.target.value)}><option value="">All teams</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label><span className="label">Employee</span><select className="input" value={filters.employeeId} onChange={event => updateFilter("employeeId", event.target.value)}><option value="">All employees</option>{filteredEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
        <label><span className="label">Task</span><select className="input" value={filters.taskId} onChange={event => updateFilter("taskId", event.target.value)}><option value="">All tasks</option>{tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
        <label><span className="label">From</span><input type="date" className="input" value={filters.from} onChange={event => updateFilter("from", event.target.value)} /></label>
        <label><span className="label">To</span><input type="date" className="input" value={filters.to} min={filters.from || undefined} onChange={event => updateFilter("to", event.target.value)} /></label>
        <div className="flex items-end"><button type="button" className="btn-secondary w-full" onClick={resetFilters}>Reset filters</button></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">{["", "Submitted", "Approved", "Needs Update", "Rejected"].map(status => <button key={status || "All"} onClick={() => updateFilter("status", status)} className={filters.status === status ? "btn-primary rounded-full py-2" : "btn-secondary rounded-full py-2"}>{status || "All"}</button>)}<div className="ml-auto flex flex-wrap gap-2">{hasAnyPermission(access, [PERMISSIONS.attendanceViewTeam, PERMISSIONS.attendanceViewAll]) && <button type="button" disabled={exportingPayroll} onClick={exportPayrollCsv} className="btn-secondary rounded-full py-2"><Download className="h-4 w-4" />{exportingPayroll ? "Exporting payroll…" : "Export payroll CSV"}</button>}<button type="button" disabled={exporting} onClick={exportCsv} className="btn-secondary rounded-full py-2"><Download className="h-4 w-4" />{exporting ? "Exporting…" : "Export CSV"}</button></div></div>
    </section>
    <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[{ label: "Reports", value: summary.totalReports }, { label: "Reported hours", value: `${Number(summary.totalHours || 0).toFixed(1)}h` }, { label: "Awaiting review", value: summary.submitted }, { label: "Approved", value: summary.approved }].map(item => <article key={item.label} className="card p-5"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">{item.label}</p><p className="mt-2 text-2xl font-extrabold text-slate-950">{item.value}</p></article>)}
    </section>
    {error && <p className="mb-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>}
    {loading && <p className="card p-8 text-center text-slate-500">Loading reports…</p>}
    {!loading && <div className="grid gap-5 xl:grid-cols-2">{items.map(report => { const employee = employees.find(item => item.id === report.employeeId); const avatar = employee?.avatarUrl || `https://i.pravatar.cc/96?u=${encodeURIComponent(report.employee)}`; return <article key={report.id} className="card p-6"><div className="flex justify-between gap-4"><div className="flex gap-4"><img src={avatar} alt="" className="h-12 w-12 rounded-full object-cover" /><div><h2 className="text-lg font-bold">{report.employee}</h2><p className="text-sm text-slate-500">{report.date} · {report.hours}h</p></div></div><Pill tone={toneFor(report.status)}>{report.status}</Pill></div><p className="mt-5"><strong>Task:</strong> {report.task}</p><p className="mt-3">{report.workCompleted}</p><p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-700">⚠ {report.problems}</p><p className="mt-2 rounded-2xl bg-blue-50 px-3 py-2 text-sm text-blue-700">→ Tomorrow: {report.tomorrowPlan}</p>{report.managerComment && <p className="mt-2 rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Previous decision: {report.managerComment}</p>}<textarea value={comments[report.id] || ""} onChange={event => setComments(current => ({ ...current, [report.id]: event.target.value }))} className="input mt-4 min-h-20" placeholder="Manager comment (optional)" /><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => decide(report.id, "Approved")} className="btn-primary rounded-full">Approve</button><button onClick={() => decide(report.id, "Needs Update")} className="btn-secondary rounded-full">Request update</button><button onClick={() => decide(report.id, "Rejected")} className="rounded-full px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50">Reject</button></div></article>; })}</div>}
    {!loading && !items.length && <p className="card p-12 text-center text-slate-500">No reports match these filters.</p>}
    {!loading && (pagination.offset > 0 || pagination.hasMore) && <div className="mt-5 flex items-center justify-between"><button type="button" className="btn-secondary" disabled={offset === 0} onClick={() => setOffset(current => Math.max(0, current - 50))}>Previous</button><span className="text-sm text-slate-500">Showing {offset + 1}–{offset + items.length}</span><button type="button" className="btn-secondary" disabled={!pagination.hasMore} onClick={() => setOffset(current => current + 50)}>Next</button></div>}
  </>;
}

function Expenses() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("All");
  const [comments, setComments] = useState({});
  const load = useCallback(() => apiJson("/api/expenses", { cache: "no-store" }).then(payload => setItems(payload.data)), []);
  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30000);
    return () => clearInterval(timer);
  }, [load]);
  const visible = filter === "All" ? items : items.filter(item => item.status === filter);
  async function decide(id, status) { await apiJson("/api/expenses", { method: "PATCH", body: JSON.stringify({ id, status, managerComment: comments[id] || `${status} by manager.` }) }); load(); }
  return <><PageHeading title="Expenses" subtitle="Employee submissions appear here for approval." /><div className="mb-5 flex flex-wrap gap-2">{["All", "Pending", "Approved", "Rejected"].map(item => <button key={item} onClick={() => setFilter(item)} className={filter === item ? "btn-primary rounded-full" : "btn-secondary rounded-full"}>{item}</button>)}</div><div className="card overflow-x-auto"><table className="min-w-full text-left"><thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500"><tr><th className="px-5 py-4">Employee</th><th>Type</th><th>Date</th><th>Note</th><th>Amount</th><th>Status</th><th>Decision</th></tr></thead><tbody>{visible.map(item => <tr className="border-t" key={item.id}><td className="px-5 py-5 font-bold">{item.employee}</td><td>{item.type}</td><td>{item.date}</td><td className="max-w-sm py-3 pr-4"><p>{item.note}</p><ExpenseReceipt expense={item} /></td><td className="font-bold">₹{item.amount.toLocaleString("en-IN")}</td><td><Pill tone={toneFor(item.status)}>{item.status}</Pill></td><td className="min-w-64 py-3 pr-4"><input value={comments[item.id] || ""} onChange={event => setComments(current => ({ ...current, [item.id]: event.target.value }))} className="input mb-2 py-2" placeholder="Comment" /><div className="flex gap-3"><button className="text-sm font-bold text-emerald-600" onClick={() => decide(item.id, "Approved")}>Approve</button><button className="text-sm font-bold text-rose-600" onClick={() => decide(item.id, "Rejected")}>Reject</button></div></td></tr>)}</tbody></table></div></>;
}

function NoAccess() {
  return <section className="card p-10 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-slate-400" /><h1 className="mt-4 text-xl font-bold">Module not available</h1><p className="mt-2 text-slate-500">Your assigned role does not include permission for this module.</p></section>;
}

export default function ManagerWorkspace({ section, role = "manager" }) {
  const access = useAccess();
  const content = useMemo(() => {
    if (!access) return null;
    if (!section) {
      if (hasPermission(access, PERMISSIONS.dashboardView)) return role === "admin" ? <AdminDashboard access={access} /> : <ManagerDashboard access={access} />;
      if (hasAnyPermission(access, [PERMISSIONS.tasksAssign, PERMISSIONS.tasksManageAll])) return <TaskBoard />;
      if (hasAnyPermission(access, [PERMISSIONS.locationsViewTeam, PERMISSIONS.locationsViewAll])) return <><PageHeading title="Live team map" subtitle="Only users in your permitted scope are shown." /><LiveTeamMap /></>;
      if (hasPermission(access, PERMISSIONS.reportsReview)) return <Reports access={access} />;
      return <NoAccess />;
    }
    if (section === "map" && hasAnyPermission(access, [PERMISSIONS.locationsViewTeam, PERMISSIONS.locationsViewAll])) return <><PageHeading title="Live team map" subtitle="Only users in your permitted scope are shown." /><LiveTeamMap /></>;
    if (section === "employees" && hasAnyPermission(access, [PERMISSIONS.employeesViewAll, PERMISSIONS.employeesManage, PERMISSIONS.tasksAssign, PERMISSIONS.teamsManage, PERMISSIONS.rolesManage])) return <EmployeeDirectory />;
    if (section === "field-tasks" && hasAnyPermission(access, [PERMISSIONS.tasksAssign, PERMISSIONS.tasksManageAll])) return <TaskBoard />;
    if (section === "tasks" && hasAnyPermission(access, [PERMISSIONS.projectsManage, PERMISSIONS.projectsReview])) return <ProjectManagement />;
    if (section === "reports" && hasPermission(access, PERMISSIONS.reportsReview)) return <Reports access={access} />;
    if (section === "attendance" && hasAnyPermission(access, [PERMISSIONS.attendanceViewTeam, PERMISSIONS.attendanceViewAll])) return <ManagerAttendance />;
    if (section === "expenses" && hasPermission(access, PERMISSIONS.expensesApprove)) return <Expenses />;
    if (section === "analytics" && hasPermission(access, PERMISSIONS.employeesViewAll)) return <Analytics />;
    if (section === "attendance-locations" && role === "admin" && hasPermission(access, PERMISSIONS.settingsManage)) return <AttendanceLocations />;
    if (section === "settings" && role === "admin" && hasAnyPermission(access, [PERMISSIONS.rolesManage, PERMISSIONS.teamsManage])) return <RolesPermissionsSettings />;
    return <NoAccess />;
  }, [access, role, section]);
  return content;
}
