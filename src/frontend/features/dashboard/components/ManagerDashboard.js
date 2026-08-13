"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, RefreshCw } from "lucide-react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import LiveTeamMap from "@/frontend/components/maps/LiveTeamMap";
import { apiJson } from "@/frontend/lib/apiClient";
import { hasAnyPermission, PERMISSIONS } from "@/shared/permissions";

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

function Metric({ label, value, dot = "bg-blue-500", danger = false }) {
  return <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-4 shadow-[0_5px_18px_rgba(15,23,42,0.05)]">
    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}</div>
    <p className={`mt-2 text-3xl font-extrabold tracking-tight ${danger ? "text-rose-500" : "text-slate-950"}`}>{value}</p>
  </div>;
}

function TrendCard({ label, value, change, color, data }) {
  return <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_5px_18px_rgba(15,23,42,0.05)]">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">{value}</p><p className={`mt-1 text-[11px] font-semibold ${color === "#f43f5e" ? "text-rose-500" : color === "#8b5cf6" ? "text-violet-500" : "text-emerald-500"}`}>{change}</p></div><ArrowRight className="h-4 w-4 text-slate-300" /></div>
    <div className="mt-2 h-10"><ResponsiveContainer width="100%" height="100%"><LineChart data={data}><Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.25} dot={false} /></LineChart></ResponsiveContainer></div>
  </div>;
}

export default function ManagerDashboard({ access }) {
  const router = useRouter();
  const [snapshot,setSnapshot]=useState({tasks:[],attendance:[],employees:[],sos:[]});
  const [serviceState,setServiceState]=useState({tasks:"loading",attendance:"loading",employees:"loading",sos:"loading"});
  const [loadVersion,setLoadVersion]=useState(0);
  const [mapReady,setMapReady]=useState(false);
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
  useEffect(() => {
    const servicesReady = Object.values(serviceState).every(status => status !== "loading");
    if (servicesReady) {
      setMapReady(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setMapReady(true), 2000);
    return () => window.clearTimeout(timer);
  }, [serviceState]);
  const managerTasks=[...snapshot.sos.map(alert=>({id:alert.id,title:`SOS · ${alert.employee}`,employee:alert.employee,client:alert.message,address:`${alert.latitude}, ${alert.longitude}`,priority:"Urgent",status:"Blocked",updatedAt:alert.createdAt})),...snapshot.tasks];
  const onDuty=new Set(snapshot.attendance.filter(item=>!item.checkOut).map(item=>item.employeeId)).size;
  const hours=serviceState.attendance==="ready"?Array.from(snapshot.attendance.reduce((groups,item)=>{if(item.date===localDayKey()){const current=groups.get(item.employee)||0;groups.set(item.employee,current+(item.durationSeconds||0)/3600);}return groups;},new Map()),([name,value])=>({name:name.split(" ")[0],value:Number(value.toFixed(2))})):[];
  const weekly=serviceState.tasks==="ready"?Array.from({length:7},(_,offset)=>{const date=new Date();date.setDate(date.getDate()-(6-offset));const key=localDayKey(date);return{day:date.toLocaleDateString("en",{weekday:"short",timeZone:workspaceTimeZone}),tasks:snapshot.tasks.filter(item=>item.status==="Completed"&&item.updatedAt&&localDayKey(item.updatedAt)===key).length};}):[];
  const failedServices=Object.entries(serviceState).filter(([,status])=>status==="error").map(([service])=>service);
  const attendanceReady=serviceState.attendance==="ready";
  const employeesReady=serviceState.employees==="ready";
  const tasksReady=serviceState.tasks==="ready";
  const sosReady=serviceState.sos==="ready";
  const approvedEmployees=snapshot.employees.filter(employee=>employee.approvalStatus==="approved");
  const totalEmployees=snapshot.employees.length;
  const completedTasks=managerTasks.filter(item=>item.status==="Completed").length;
  const blockedTasks=managerTasks.filter(item=>item.status==="Blocked").length;
  const completionRate=managerTasks.length?Math.round(completedTasks/managerTasks.length*100):0;
  const attendanceRate=totalEmployees?Math.round(onDuty/totalEmployees*100):0;
  const onTimeRate=completedTasks+blockedTasks?Math.round(completedTasks/(completedTasks+blockedTasks)*100):0;
  const averageHours=hours.length?hours.reduce((sum,item)=>sum+item.value,0)/hours.length:0;
  const averageHoursLabel=`${String(Math.floor(averageHours)).padStart(2,"0")}h ${String(Math.round((averageHours%1)*60)).padStart(2,"0")}m`;
  const weeklyTrend=weekly.map(item=>({value:item.tasks}));
  const hoursTrend=hours.map(item=>({value:item.value}));
  const taskTrend=managerTasks.slice(0,7).reverse().map((item,index)=>({value:item.status==="Completed"?70+index*4:item.status==="Blocked"?38:55+index*3}));
  const teamMembers=snapshot.employees.slice(0,5);
  const todayLabel=new Intl.DateTimeFormat("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:workspaceTimeZone}).format(new Date());
  return <div className="mx-auto max-w-[1500px]">
    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><h1 className="text-2xl font-extrabold tracking-tight text-slate-950">Team Overview</h1><p className="mt-1 text-xs font-medium text-slate-500">{todayLabel}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm">All Teams <span className="text-slate-400">⌄</span></button>
        <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm"><CalendarDays className="h-4 w-4" />Today <span className="text-slate-400">⌄</span></button>
        <button type="button" aria-label="Refresh dashboard" onClick={()=>setLoadVersion(version=>version+1)} className="grid h-10 w-10 place-items-center rounded-lg bg-blue-600 text-white shadow-sm transition hover:bg-blue-700"><RefreshCw className="h-4 w-4" /></button>
      </div>
    </div>
    {failedServices.length>0&&<div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><span><strong>Some services could not be loaded:</strong> {failedServices.join(", ")}. Unavailable totals are shown as dashes.</span><button onClick={()=>setLoadVersion(version=>version+1)} className="rounded-full border border-rose-300 bg-white px-4 py-2 font-bold text-rose-700">Retry</button></div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Total Employees" value={employeesReady?totalEmployees:"—"} dot="bg-slate-400" />
      <Metric label="Active" value={employeesReady?approvedEmployees.length:"—"} dot="bg-emerald-500" />
      <Metric label="On Duty" value={attendanceReady?onDuty:"—"} dot="bg-emerald-500" />
      <Metric label="Offline" value={attendanceReady&&employeesReady?Math.max(0,totalEmployees-onDuty):"—"} dot="bg-rose-500" />
      <Metric label="SOS / Alerts" value={sosReady?snapshot.sos.length:"—"} dot="bg-rose-500" danger />
    </div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,.85fr)]">
      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_5px_18px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between px-4 py-3"><h2 className="text-sm font-bold text-slate-900">Live Team Tracking</h2><button onClick={()=>router.push("/manager/map")} className="text-xs font-semibold text-blue-600">View map <ArrowRight className="ml-1 inline h-3 w-3" /></button></div>
        <div className="h-[360px] overflow-hidden [&>div]:!block [&>div>div]:!h-[360px] [&>div>div]:!min-h-0 [&_.leaflet-container]:!h-[360px] [&_aside]:!hidden">{mapReady ? <LiveTeamMap /> : <div className="grid h-full place-items-center bg-slate-50 text-xs font-semibold text-slate-400"><span className="animate-pulse">Preparing live map…</span></div>}</div>
      </section>
      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_5px_18px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">Team Members</h2><button onClick={()=>router.push("/manager/employees")} className="text-xs font-semibold text-blue-600">View all</button></div>
        <div className="divide-y divide-slate-100">{teamMembers.map(employee=>{const active=onDuty&&new Set(snapshot.attendance.filter(item=>!item.checkOut).map(item=>item.employeeId)).has(employee.id);const name=employee.name||employee.full_name||"Team member";const detail=employee.department||employee.dynamicRole?.name||employee.role||"Field team";return <button key={employee.id} onClick={()=>router.push("/manager/employees")} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"><span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-200 text-xs font-extrabold text-slate-600">{employee.avatar?<img src={employee.avatar} alt="" className="h-full w-full object-cover" />:name.split(" ").map(part=>part[0]).slice(0,2).join("")}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-800">{name}</strong><small className="mt-0.5 block truncate text-[10px] text-slate-400">{detail}</small></span><span className={`text-[10px] font-bold ${active?"text-emerald-500":"text-slate-400"}`}>{active?"Active":"Offline"}</span></button>;})}{employeesReady&&!teamMembers.length&&<p className="px-4 py-10 text-center text-xs text-slate-400">No team members available.</p>}</div>
      </section>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <TrendCard label="Tasks Completed" value={tasksReady?`${completionRate}%`:"—"} change={`${completedTasks} completed`} color="#3b82f6" data={weeklyTrend.length?weeklyTrend:[{value:0}]} />
      <TrendCard label="Attendance Rate" value={attendanceReady&&employeesReady?`${attendanceRate}%`:"—"} change={`${onDuty} currently on duty`} color="#10b981" data={hoursTrend.length?hoursTrend:[{value:0}]} />
      <TrendCard label="On-time Tasks" value={tasksReady?`${onTimeRate}%`:"—"} change={`${blockedTasks} blocked`} color="#8b5cf6" data={taskTrend.length?taskTrend:[{value:0}]} />
      <TrendCard label="Average Working Hours" value={attendanceReady?averageHoursLabel:"—"} change={`${hours.length} team records today`} color="#3b82f6" data={hoursTrend.length?hoursTrend:[{value:0}]} />
    </div>
  </div>;
}
