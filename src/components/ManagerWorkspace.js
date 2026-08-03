"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Clock3, Download, MapPin, Plus, Search, ShieldCheck, UserPlus, UsersRound, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import LiveTeamMap from "@/components/LiveTeamMap";
import ManagerAttendance from "@/components/ManagerAttendance";
import { activity, attendanceRows, managerEmployees, managerExpenses, managerReports, managerTasks } from "@/lib/managerData";
import { apiJson } from "@/lib/apiClient";
import EmployeeDirectory from "@/components/EmployeeDirectory";
import ProjectManagement from "@/components/ProjectManagement";
import AttendanceLocations from "@/components/AttendanceLocations";
import RolesPermissionsSettings from "@/components/RolesPermissionsSettings";
import { useAccess } from "@/components/AccessContext";
import { hasAnyPermission, hasPermission, PERMISSIONS } from "@/lib/permissions";

const weekly = [
  { day: "Mon", tasks: 32 }, { day: "Tue", tasks: 41 }, { day: "Wed", tasks: 38 }, { day: "Thu", tasks: 47 },
  { day: "Fri", tasks: 52 }, { day: "Sat", tasks: 28 }, { day: "Sun", tasks: 14 }
];
const hours = [{ name: "Aarav", value: 9 }, { name: "Neha", value: 8 }, { name: "Rohit", value: 7 }, { name: "Simran", value: 7 }, { name: "Vikram", value: 7 }, { name: "Anjali", value: 7 }];
const throughput = Array.from({ length: 14 }, (_, index) => ({ day: `D${index + 1}`, tasks: [19, 21, 26, 19, 17, 12, 19, 23, 28, 25, 18, 10, 14, 22][index], sla: [98, 92, 94, 95, 95, 94, 93, 94, 95, 93, 91, 93, 98, 95][index] }));
const performance = managerEmployees.map(employee => ({ name: employee.name.split(" ")[0], value: employee.performance }));
const taskMix = [{ name: "Installation", value: 42, color: "#3b82f6" }, { name: "Maintenance", value: 28, color: "#10b981" }, { name: "Audit", value: 18, color: "#8b5cf6" }, { name: "Repair", value: 12, color: "#f59e0b" }];
const columns = ["Assigned", "On The Way", "In Progress", "Completed", "Blocked"];
const workspaceTimeZone = "Asia/Kolkata";

function localDayKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: workspaceTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function PageHeading({ title, subtitle, action }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">{title}</h1><p className="mt-1 text-base text-slate-500">{subtitle}</p></div>{action}</div>;
}

function Pill({ children, tone = "blue" }) {
  const styles = { blue: "border-blue-200 bg-blue-50 text-blue-700", green: "border-emerald-200 bg-emerald-50 text-emerald-700", red: "border-rose-200 bg-rose-50 text-rose-700", amber: "border-amber-200 bg-amber-50 text-amber-700", slate: "border-slate-200 bg-slate-100 text-slate-600", violet: "border-violet-200 bg-violet-50 text-violet-700" };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${styles[tone]}`}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{children}</span>;
}

function toneFor(value) {
  if (["On Duty", "Task Completed", "Completed", "Approved", "On time"].includes(value)) return "green";
  if (["Blocked", "Urgent", "Rejected"].includes(value)) return "red";
  if (["On Break", "High", "Late", "Needs Update", "Pending"].includes(value)) return "amber";
  if (["Offline", "Low", "Assigned"].includes(value)) return "slate";
  if (value === "On The Way") return "violet";
  return "blue";
}

function Modal({ title, onClose, children }) {
  return <div className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950/50 p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{title}</h2><button aria-label="Close" onClick={onClose} className="icon-button"><X className="h-5 w-5" /></button></div>
      <div className="mt-5">{children}</div>
    </section>
  </div>;
}

function Metric({ label, value, icon: Icon, tone, trend }) {
  return <div className="card p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p><p className="mt-3 text-3xl font-extrabold text-slate-950">{value}</p>{trend && <p className={`mt-2 text-xs font-bold ${trend.startsWith("-") ? "text-rose-600" : "text-emerald-600"}`}>{trend.startsWith("-") ? "↘" : "↗"} {trend.replace("-", "")} vs last week</p>}</div><span className={`grid h-12 w-12 place-items-center rounded-full ${tone}`}><Icon className="h-5 w-5" /></span></div></div>;
}

function Dashboard({ access }) {
  const router = useRouter();
  const [snapshot,setSnapshot]=useState({tasks:[],attendance:[],employees:[],sos:[]});
  const [serviceState,setServiceState]=useState({tasks:"loading",attendance:"loading",employees:"loading",sos:"loading"});
  const [loadVersion,setLoadVersion]=useState(0);
  useEffect(() => {
    let active = true;
    const allowed = async (service, permissions, endpoint) => {
      if (!hasAnyPermission(access, permissions)) return { service, status: "unavailable", data: [] };
      try {
        const payload = await apiJson(endpoint, { cache: "no-store" });
        if (!Array.isArray(payload.data)) throw new Error("Invalid service response");
        return { service, status: "ready", data: payload.data };
      } catch {
        return { service, status: "error", data: [] };
      }
    };
    Promise.all([
      allowed("tasks", [PERMISSIONS.tasksAssign, PERMISSIONS.tasksManageAll], "/api/tasks"),
      allowed("attendance", [PERMISSIONS.attendanceViewTeam, PERMISSIONS.attendanceViewAll], "/api/attendance"),
      allowed("employees", [PERMISSIONS.employeesViewAll, PERMISSIONS.tasksAssign], "/api/employees"),
      allowed("sos", [PERMISSIONS.sosViewTeam], "/api/sos")
    ]).then(results => {
      if (!active) return;
      setSnapshot(Object.fromEntries(results.map(result => [result.service, result.data])));
      setServiceState(Object.fromEntries(results.map(result => [result.service, result.status])));
    });
    return () => { active = false; };
  }, [access, loadVersion]);
  const managerTasks=[...snapshot.sos.map(alert=>({id:alert.id,title:`SOS · ${alert.employee}`,employee:alert.employee,client:alert.message,address:`${alert.latitude}, ${alert.longitude}`,priority:"Urgent",status:"Blocked",updatedAt:alert.createdAt})),...snapshot.tasks];
  const onDuty=new Set(snapshot.attendance.filter(item=>!item.checkOut).map(item=>item.employeeId)).size;
  const hours=serviceState.attendance==="ready"?Array.from(snapshot.attendance.reduce((groups,item)=>{if(item.date===localDayKey()){const current=groups.get(item.employee)||0;groups.set(item.employee,current+(item.durationSeconds||0)/3600);}return groups;},new Map()),([name,value])=>({name:name.split(" ")[0],value:Number(value.toFixed(2))})):[];
  const weekly=serviceState.tasks==="ready"?Array.from({length:7},(_,offset)=>{const date=new Date();date.setDate(date.getDate()-(6-offset));const key=localDayKey(date);return{day:date.toLocaleDateString("en",{weekday:"short",timeZone:workspaceTimeZone}),tasks:snapshot.tasks.filter(item=>item.status==="Completed"&&item.updatedAt&&localDayKey(item.updatedAt)===key).length};}):[];
  const activity=managerTasks.slice(0,5).map(item=>({person:item.employee,action:`is ${item.status.toLowerCase()}`,detail:item.title,time:item.updatedAt?new Date(item.updatedAt).toLocaleString():"Recently",color:item.status==="Blocked"?"bg-rose-500":item.status==="Completed"?"bg-emerald-500":"bg-blue-500"}));
  const failedServices=Object.entries(serviceState).filter(([,status])=>status==="error").map(([service])=>service);
  const attendanceReady=serviceState.attendance==="ready";
  const employeesReady=serviceState.employees==="ready";
  const tasksReady=serviceState.tasks==="ready";
  const sosReady=serviceState.sos==="ready";
  return <>
    <PageHeading title="Operations dashboard" subtitle="Live pulse of your field team." />
    {failedServices.length>0&&<div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><span><strong>Some services could not be loaded:</strong> {failedServices.join(", ")}. Unavailable totals are shown as dashes.</span><button onClick={()=>setLoadVersion(version=>version+1)} className="rounded-full border border-rose-300 bg-white px-4 py-2 font-bold text-rose-700">Retry</button></div>}
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="On duty" value={attendanceReady&&employeesReady?`${onDuty} / ${snapshot.employees.length}`:"—"} icon={UsersRound} tone="bg-teal-50 text-teal-600" />
      <Metric label="In progress" value={tasksReady?managerTasks.filter(item=>item.status==="In Progress").length:"—"} icon={ClipboardList} tone="bg-blue-50 text-blue-600" />
      <Metric label="Completed" value={tasksReady?managerTasks.filter(item=>item.status==="Completed").length:"—"} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" />
      <Metric label="Blocked" value={tasksReady&&sosReady?managerTasks.filter(item=>item.status==="Blocked").length:"—"} icon={AlertTriangle} tone="bg-rose-50 text-rose-600" />
    </div>
    <div className="mt-7 grid gap-7 xl:grid-cols-[2fr_1fr]">
      <div className="card p-6"><div className="flex items-start justify-between"><div><h2 className="font-bold">Weekly task completion</h2><p className="text-sm text-slate-500">Tasks closed by day</p></div><Pill tone="green">Trending up</Pill></div><div className="mt-5 h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={weekly}><CartesianGrid stroke="#e8edf5" vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><Tooltip /><Line type="monotone" dataKey="tasks" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: "white", strokeWidth: 3 }} /></LineChart></ResponsiveContainer></div></div>
      <div className="card flex flex-col p-6"><h2 className="font-bold">Live activity</h2><div className="mt-5 space-y-4">{activity.map((item, index) => <div className="flex gap-3" key={index}><span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${item.color}`} /><div className="text-sm"><p><strong>{item.person}</strong> {item.action} <span className="text-slate-500">— {item.detail}</span></p><p className="mt-0.5 text-xs text-slate-500">{item.time}</p></div></div>)}</div><button onClick={() => router.push("/manager/map")} className="mt-auto inline-flex items-center gap-2 pt-5 text-left text-sm font-bold text-blue-600">Open live map <ArrowRight className="h-4 w-4" /></button></div>
    </div>
    <div className="mt-7 grid gap-7 xl:grid-cols-[2fr_1fr]">
      <div className="card p-6"><div className="flex justify-between"><h2 className="font-bold">Team hours today</h2><button onClick={() => router.push("/manager/employees")} className="text-sm font-bold text-blue-600">View team</button></div><div className="mt-4 h-64"><ResponsiveContainer><BarChart data={hours}><CartesianGrid stroke="#e8edf5" vertical={false} /><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="value" fill="#3b82f6" radius={[10, 10, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
      <div className="card p-6"><h2 className="font-bold">Alerts</h2><div className="mt-5 space-y-3">{managerTasks.filter(task => task.priority === "Urgent" || task.status === "Blocked").map(task => <button key={task.id} onClick={() => router.push("/manager/tasks")} className="block w-full rounded-2xl border border-slate-200 p-4 text-left hover:border-blue-300"><div className="flex gap-2"><Pill tone={toneFor(task.priority)}>{task.priority}</Pill><Pill tone={toneFor(task.status)}>{task.status}</Pill></div><p className="mt-2 font-bold">{task.title}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{task.client}</p></button>)}</div></div>
    </div>
  </>;
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

function TaskBoard() {
  const [items, setItems] = useState([]);
  const [adding, setAdding] = useState(false);
  const [employees,setEmployees]=useState([]);
  const [error, setError] = useState("");
  const managerEmployees = employees.length ? employees : [{ id: "", name: "No approved employees yet" }];
  useEffect(()=>{Promise.all([apiJson("/api/tasks"),apiJson("/api/employees")]).then(([taskPayload,employeePayload])=>{setItems(taskPayload.data);setEmployees(employeePayload.data.filter(item=>item.approvalStatus==="approved"));setError("");}).catch(failure=>setError(failure.message));},[]);
  async function drop(event, status) { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); try { const payload=await apiJson("/api/tasks",{method:"PATCH",body:JSON.stringify({id,status})}); setItems(current => current.map(item => item.id === id ? payload.data : item)); setError(""); } catch (failure) { setError(failure.message); } }
  async function add(event) { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); if(!data.employeeId){setError("Create or approve an employee account before assigning a task.");return;} try{const payload=await apiJson("/api/tasks",{method:"POST",body:JSON.stringify(data)});setItems(current=>[payload.data,...current]);setAdding(false);setError("");}catch(failure){setError(failure.message);} }
  return <><PageHeading title="Task board" subtitle="Drag tasks between columns to update status." action={<button onClick={() => setAdding(true)} className="btn-primary rounded-full px-7 py-4 text-base"><Plus className="h-5 w-5" />Assign task</button>} />{error && <p className="mb-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>}<div className="grid gap-4 overflow-x-auto xl:grid-cols-5">{columns.map(column => { const columnItems = items.filter(item => item.status === column); return <section key={column} onDragOver={event => event.preventDefault()} onDrop={event => drop(event, column)} className="min-h-[500px] min-w-[250px] rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 p-4"><div className="mb-4 flex items-center gap-3"><Pill tone={toneFor(column)}>{column}</Pill><span className="text-sm font-bold text-slate-500">{columnItems.length}</span></div><div className="space-y-3">{columnItems.map(task => <article draggable onDragStart={event => event.dataTransfer.setData("text/plain", task.id)} key={task.id} className="cursor-grab rounded-2xl border border-slate-200 bg-white p-4 shadow-sm active:cursor-grabbing"><div className="flex items-start justify-between gap-2"><h3 className="truncate font-bold" title={task.title}>{task.title}</h3><Pill tone={toneFor(task.priority)}>{task.priority}</Pill></div><p className="mt-2 text-sm text-slate-500">{task.client}</p><p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" />{task.address}</p><p className="mt-4 text-sm font-medium">{task.employee}</p></article>)}</div></section>; })}</div>
    {adding && <Modal title="Assign task" onClose={() => setAdding(false)}><form onSubmit={add} className="space-y-4"><label><span className="label">Task title</span><input name="title" required className="input" /></label><label><span className="label">Employee</span><select name="employeeId" className="input">{managerEmployees.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span className="label">Client</span><input name="client" required className="input" /></label><label><span className="label">Site/address</span><input name="address" required className="input" /></label><label><span className="label">Priority</span><select name="priority" className="input"><option>Low</option><option>Medium</option><option>High</option><option>Urgent</option></select></label><button className="btn-primary w-full">Create assignment</button></form></Modal>}
  </>;
}

function LegacyReports() {
  const [items, setItems] = useState(managerReports);
  const [filter, setFilter] = useState("All");
  const visible = filter === "All" ? items : items.filter(item => item.status === filter);
  const setStatus = (id, status) => setItems(current => current.map(item => item.id === id ? { ...item, status } : item));
  return <><PageHeading title="Daily reports" subtitle="Review field updates and approve submitted work." /><div className="mb-5 flex flex-wrap gap-2">{["All", "Submitted", "Approved", "Needs Update"].map(item => <button key={item} onClick={() => setFilter(item)} className={filter === item ? "btn-primary rounded-full py-2" : "btn-secondary rounded-full py-2"}>{item}</button>)}</div><div className="grid gap-5 xl:grid-cols-2">{visible.map(report => { const employee = managerEmployees.find(item => item.id === report.employeeId); return <article key={report.id} className="card p-6"><div className="flex justify-between gap-4"><div className="flex gap-4"><img src={employee.avatar} alt="" className="h-12 w-12 rounded-full object-cover" /><div><h2 className="text-lg font-bold">{report.employee}</h2><p className="text-sm text-slate-500">{report.date} · {report.hours}</p></div></div><Pill tone={toneFor(report.status)}>{report.status}</Pill></div><p className="mt-5"><strong>Task:</strong> {report.task}</p><p className="mt-3">{report.note}</p><p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-700">⚠ {report.issue}</p><p className="mt-2 rounded-2xl bg-blue-50 px-3 py-2 text-sm text-blue-700">→ Tomorrow: {report.tomorrow}</p>{report.status !== "Approved" && <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => setStatus(report.id, "Approved")} className="btn-primary rounded-full px-7">Approve</button><button onClick={() => setStatus(report.id, "Needs Update")} className="btn-secondary rounded-full px-7">Request update</button></div>}</article>; })}</div>{!visible.length && <p className="card p-12 text-center text-slate-500">No reports in this category.</p>}</>;
}

function LegacyAttendance() {
  function download() { const rows = [["Employee", "Date", "Check-in", "Check-out", "Hours", "Status"], ...attendanceRows.map(item => [item.employee, item.date, item.checkIn, item.checkOut, item.hours, item.status])]; const blob = new Blob([rows.map(row => row.join(",")).join("\n")], { type: "text/csv" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "fieldflow-attendance.csv"; link.click(); URL.revokeObjectURL(url); }
  return <><PageHeading title="Attendance overview" subtitle="Team check-ins for today." action={<button onClick={download} className="btn-secondary"><Download className="h-4 w-4" />Export CSV</button>} /><div className="grid gap-5 sm:grid-cols-3"><Metric label="Present" value="3" icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" /><Metric label="Absent" value="5" icon={UsersRound} tone="bg-rose-50 text-rose-600" /><Metric label="On leave" value="0" icon={Clock3} tone="bg-amber-50 text-amber-600" /></div><div className="card mt-7 overflow-x-auto"><table className="min-w-full text-left"><thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500"><tr><th className="px-5 py-4">Employee</th><th>Date</th><th>Check-in</th><th>Check-out</th><th>Hours</th><th>Status</th></tr></thead><tbody>{attendanceRows.map(row => { const employee = managerEmployees.find(item => item.id === row.employeeId); return <tr key={row.id} className="border-t"><td className="px-5 py-3"><div className="flex items-center gap-3"><img src={employee.avatar} alt="" className="h-10 w-10 rounded-full object-cover" /><strong>{row.employee}</strong></div></td><td>{row.date}</td><td>{row.checkIn}</td><td>{row.checkOut}</td><td>{row.hours}</td><td><Pill tone={toneFor(row.status)}>{row.status}</Pill></td></tr>; })}</tbody></table></div></>;
}

function LegacyExpenses() {
  const [items, setItems] = useState(managerExpenses);
  const [filter, setFilter] = useState("All");
  const visible = filter === "All" ? items : items.filter(item => item.status === filter);
  const update = (id, status) => setItems(current => current.map(item => item.id === id ? { ...item, status } : item));
  return <><PageHeading title="Expenses" subtitle="Review field costs submitted by your team." /><div className="mb-5 flex gap-2">{["All", "Pending", "Approved", "Rejected"].map(item => <button key={item} onClick={() => setFilter(item)} className={filter === item ? "btn-primary rounded-full" : "btn-secondary rounded-full"}>{item}</button>)}</div><div className="card overflow-x-auto"><table className="min-w-full text-left"><thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500"><tr><th className="px-5 py-4">Employee</th><th>Type</th><th>Date</th><th>Note</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>{visible.map(item => <tr className="border-t" key={item.id}><td className="px-5 py-5 font-bold">{item.employee}</td><td>{item.type}</td><td>{item.date}</td><td>{item.note}</td><td className="font-bold">₹{item.amount.toLocaleString("en-IN")}</td><td><Pill tone={toneFor(item.status)}>{item.status}</Pill></td><td>{item.status === "Pending" && <div className="flex gap-2"><button className="text-sm font-bold text-emerald-600" onClick={() => update(item.id, "Approved")}>Approve</button><button className="text-sm font-bold text-rose-600" onClick={() => update(item.id, "Rejected")}>Reject</button></div>}</td></tr>)}</tbody></table></div></>;
}

function Analytics() {
  const [analyticsData,setAnalyticsData]=useState({tasks:[],employees:[]});
  useEffect(()=>{Promise.all([apiJson("/api/tasks"),apiJson("/api/employees")]).then(([taskResult,employeeResult])=>setAnalyticsData({tasks:taskResult.data,employees:employeeResult.data}));},[]);
  const taskMix=["Assigned","On The Way","In Progress","Completed","Blocked"].map((name,index)=>({name,value:analyticsData.tasks.filter(item=>item.status===name).length,color:["#64748b","#8b5cf6","#3b82f6","#10b981","#f43f5e"][index]})).filter(item=>item.value);
  const performance=analyticsData.employees.map(employee=>{const assigned=analyticsData.tasks.filter(task=>task.employeeId===employee.id);return{name:employee.name.split(" ")[0],value:assigned.length?Math.round(assigned.filter(task=>task.status==="Completed").length/assigned.length*100):0};});
  const throughput=Array.from({length:14},(_,offset)=>{const date=new Date();date.setDate(date.getDate()-(13-offset));const key=date.toISOString().slice(0,10);const changed=analyticsData.tasks.filter(item=>item.updatedAt?.slice(0,10)===key);const done=changed.filter(item=>item.status==="Completed").length;return{day:`D${offset+1}`,tasks:done,sla:changed.length?Math.round(done/changed.length*100):100};});
  return <><PageHeading title="Analytics" subtitle="Performance, throughput and SLA insights." /><div className="grid gap-7 xl:grid-cols-[2fr_1fr]"><div className="card p-6"><h2 className="font-bold">Throughput & SLA (14 days)</h2><div className="mt-4 h-72"><ResponsiveContainer><LineChart data={throughput}><CartesianGrid stroke="#e8edf5" vertical={false} /><XAxis dataKey="day" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} /><Tooltip /><Legend /><Line name="Tasks done" dataKey="tasks" stroke="#3b82f6" strokeWidth={2.5} /><Line name="SLA %" dataKey="sla" stroke="#10b981" strokeWidth={2.5} /></LineChart></ResponsiveContainer></div></div><div className="card p-6"><h2 className="font-bold">Task mix</h2><div className="h-72"><ResponsiveContainer><PieChart><Pie data={taskMix} dataKey="value" nameKey="name" innerRadius={62} outerRadius={100} paddingAngle={3}>{taskMix.map(item => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div></div></div><div className="card mt-7 p-6"><h2 className="font-bold">Employee performance</h2><div className="mt-4 h-72"><ResponsiveContainer><BarChart data={performance}><CartesianGrid stroke="#e8edf5" vertical={false} /><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="value" fill="#2563eb" radius={[10, 10, 0, 0]} /></BarChart></ResponsiveContainer></div></div></>;
}

function Reports() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("All");
  const [comments, setComments] = useState({});
  const load = useCallback(() => apiJson("/api/reports", { cache: "no-store" }).then(payload => setItems(payload.data)), []);
  useEffect(() => { load(); const timer = setInterval(load, 5000); return () => clearInterval(timer); }, [load]);
  const visible = filter === "All" ? items : items.filter(item => item.status === filter);
  async function decide(id, status) { await apiJson("/api/reports", { method: "PATCH", body: JSON.stringify({ id, status, managerComment: comments[id] || (status === "Approved" ? "Approved by manager." : "Please review the manager decision.") }) }); load(); }
  return <><PageHeading title="Daily reports" subtitle="Employee updates appear here automatically for review." /><div className="mb-5 flex flex-wrap gap-2">{["All", "Submitted", "Approved", "Needs Update", "Rejected"].map(item => <button key={item} onClick={() => setFilter(item)} className={filter === item ? "btn-primary rounded-full py-2" : "btn-secondary rounded-full py-2"}>{item}</button>)}</div><div className="grid gap-5 xl:grid-cols-2">{visible.map(report => { const employee = managerEmployees.find(item => item.id === report.employeeId); const avatar = employee?.avatar || `https://i.pravatar.cc/96?u=${encodeURIComponent(report.employee)}`; return <article key={report.id} className="card p-6"><div className="flex justify-between gap-4"><div className="flex gap-4"><img src={avatar} alt="" className="h-12 w-12 rounded-full object-cover" /><div><h2 className="text-lg font-bold">{report.employee}</h2><p className="text-sm text-slate-500">{report.date} · {report.hours}h</p></div></div><Pill tone={toneFor(report.status)}>{report.status}</Pill></div><p className="mt-5"><strong>Task:</strong> {report.task}</p><p className="mt-3">{report.workCompleted}</p><p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-700">⚠ {report.problems}</p><p className="mt-2 rounded-2xl bg-blue-50 px-3 py-2 text-sm text-blue-700">→ Tomorrow: {report.tomorrowPlan}</p>{report.managerComment && <p className="mt-2 rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Previous decision: {report.managerComment}</p>}<textarea value={comments[report.id] || ""} onChange={event => setComments(current => ({ ...current, [report.id]: event.target.value }))} className="input mt-4 min-h-20" placeholder="Manager comment (optional)" /><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => decide(report.id, "Approved")} className="btn-primary rounded-full">Approve</button><button onClick={() => decide(report.id, "Needs Update")} className="btn-secondary rounded-full">Request update</button><button onClick={() => decide(report.id, "Rejected")} className="rounded-full px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50">Reject</button></div></article>; })}</div>{!visible.length && <p className="card p-12 text-center text-slate-500">No reports in this category.</p>}</>;
}

function LegacyConnectedAttendance() {
  const [items, setItems] = useState([]);
  const load = useCallback(() => fetch("/api/attendance", { cache: "no-store" }).then(response => response.json()).then(payload => setItems(payload.data)), []);
  useEffect(() => { load(); const timer = setInterval(load, 5000); return () => clearInterval(timer); }, [load]);
  function download() { const rows = [["Employee", "Date", "Check-in", "Check-out", "Hours", "Status"], ...items.map(item => [item.employee, item.date, item.checkIn, item.checkOut || "", item.hours, item.status])]; const blob = new Blob([rows.map(row => row.join(",")).join("\n")], { type: "text/csv" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "fieldflow-attendance.csv"; link.click(); URL.revokeObjectURL(url); }
  const active = items.filter(item => !item.checkOut).length;
  return <><PageHeading title="Attendance overview" subtitle="GPS-verified team check-ins update automatically." action={<button onClick={download} className="btn-secondary"><Download className="h-4 w-4" />Export CSV</button>} /><div className="grid gap-5 sm:grid-cols-3"><Metric label="Currently on duty" value={active} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" /><Metric label="Attendance records" value={items.length} icon={UsersRound} tone="bg-blue-50 text-blue-600" /><Metric label="Late records" value={items.filter(item => item.status === "Late").length} icon={Clock3} tone="bg-amber-50 text-amber-600" /></div><div className="card mt-7 overflow-x-auto"><table className="min-w-full text-left"><thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500"><tr><th className="px-5 py-4">Employee</th><th>Date</th><th>Check-in</th><th>Check-out</th><th>Hours</th><th>GPS</th><th>Status</th></tr></thead><tbody>{items.map(row => <tr key={row.id} className="border-t"><td className="px-5 py-4 font-bold">{row.employee}</td><td>{row.date}</td><td>{row.checkIn}</td><td>{row.checkOut || "On duty"}</td><td>{row.hours}</td><td>{row.checkInLocation ? <a target="_blank" rel="noreferrer" className="font-bold text-blue-600" href={`https://www.openstreetmap.org/?mlat=${row.checkInLocation.latitude}&mlon=${row.checkInLocation.longitude}`}>View</a> : "—"}</td><td><Pill tone={toneFor(row.status)}>{row.status}</Pill></td></tr>)}</tbody></table></div></>;
}

function Expenses() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("All");
  const [comments, setComments] = useState({});
  const load = useCallback(() => apiJson("/api/expenses", { cache: "no-store" }).then(payload => setItems(payload.data)), []);
  useEffect(() => { load(); const timer = setInterval(load, 5000); return () => clearInterval(timer); }, [load]);
  const visible = filter === "All" ? items : items.filter(item => item.status === filter);
  async function decide(id, status) { await apiJson("/api/expenses", { method: "PATCH", body: JSON.stringify({ id, status, managerComment: comments[id] || `${status} by manager.` }) }); load(); }
  return <><PageHeading title="Expenses" subtitle="Employee submissions appear here for approval." /><div className="mb-5 flex flex-wrap gap-2">{["All", "Pending", "Approved", "Rejected"].map(item => <button key={item} onClick={() => setFilter(item)} className={filter === item ? "btn-primary rounded-full" : "btn-secondary rounded-full"}>{item}</button>)}</div><div className="card overflow-x-auto"><table className="min-w-full text-left"><thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500"><tr><th className="px-5 py-4">Employee</th><th>Type</th><th>Date</th><th>Note</th><th>Amount</th><th>Status</th><th>Decision</th></tr></thead><tbody>{visible.map(item => <tr className="border-t" key={item.id}><td className="px-5 py-5 font-bold">{item.employee}</td><td>{item.type}</td><td>{item.date}</td><td>{item.note}</td><td className="font-bold">₹{item.amount.toLocaleString("en-IN")}</td><td><Pill tone={toneFor(item.status)}>{item.status}</Pill></td><td className="min-w-64 py-3 pr-4"><input value={comments[item.id] || ""} onChange={event => setComments(current => ({ ...current, [item.id]: event.target.value }))} className="input mb-2 py-2" placeholder="Comment" /><div className="flex gap-3"><button className="text-sm font-bold text-emerald-600" onClick={() => decide(item.id, "Approved")}>Approve</button><button className="text-sm font-bold text-rose-600" onClick={() => decide(item.id, "Rejected")}>Reject</button></div></td></tr>)}</tbody></table></div></>;
}

function NoAccess() {
  return <section className="card p-10 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-slate-400" /><h1 className="mt-4 text-xl font-bold">Module not available</h1><p className="mt-2 text-slate-500">Your assigned role does not include permission for this module.</p></section>;
}

export default function ManagerWorkspace({ section, role = "manager" }) {
  const access = useAccess();
  const content = useMemo(() => {
    if (!access) return null;
    if (!section) {
      if (hasPermission(access, PERMISSIONS.dashboardView)) return <Dashboard access={access} />;
      if (hasAnyPermission(access, [PERMISSIONS.tasksAssign, PERMISSIONS.tasksManageAll])) return <TaskBoard />;
      if (hasAnyPermission(access, [PERMISSIONS.locationsViewTeam, PERMISSIONS.locationsViewAll])) return <><PageHeading title="Live team map" subtitle="Only users in your permitted scope are shown." /><LiveTeamMap /></>;
      if (hasPermission(access, PERMISSIONS.reportsReview)) return <Reports />;
      return <NoAccess />;
    }
    if (section === "map" && hasAnyPermission(access, [PERMISSIONS.locationsViewTeam, PERMISSIONS.locationsViewAll])) return <><PageHeading title="Live team map" subtitle="Only users in your permitted scope are shown." /><LiveTeamMap /></>;
    if (section === "employees" && hasAnyPermission(access, [PERMISSIONS.employeesViewAll, PERMISSIONS.employeesManage, PERMISSIONS.tasksAssign, PERMISSIONS.teamsManage, PERMISSIONS.rolesManage])) return <EmployeeDirectory />;
    if (section === "field-tasks" && hasAnyPermission(access, [PERMISSIONS.tasksAssign, PERMISSIONS.tasksManageAll])) return <TaskBoard />;
    if (section === "tasks" && hasAnyPermission(access, [PERMISSIONS.projectsManage, PERMISSIONS.projectsReview])) return <ProjectManagement />;
    if (section === "reports" && hasPermission(access, PERMISSIONS.reportsReview)) return <Reports />;
    if (section === "attendance" && hasAnyPermission(access, [PERMISSIONS.attendanceViewTeam, PERMISSIONS.attendanceViewAll])) return <ManagerAttendance />;
    if (section === "expenses" && hasPermission(access, PERMISSIONS.expensesApprove)) return <Expenses />;
    if (section === "analytics" && hasPermission(access, PERMISSIONS.employeesViewAll)) return <Analytics />;
    if (section === "attendance-locations" && role === "admin" && hasPermission(access, PERMISSIONS.settingsManage)) return <AttendanceLocations />;
    if (section === "settings" && role === "admin" && hasAnyPermission(access, [PERMISSIONS.rolesManage, PERMISSIONS.teamsManage])) return <RolesPermissionsSettings />;
    return <NoAccess />;
  }, [access, role, section]);
  return content;
}
