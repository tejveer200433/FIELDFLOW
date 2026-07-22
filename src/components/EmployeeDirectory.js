"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, RefreshCw, Search, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { usePathname } from "next/navigation";
import { apiJson } from "@/lib/apiClient";

const filters = ["all", "pending", "approved", "rejected"];
const statusStyle = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700"
};

function Badge({ status }) {
  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold capitalize ${statusStyle[status] || statusStyle.pending}`}>{status}</span>;
}

export default function EmployeeDirectory() {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  const [items,setItems]=useState([]); const [query,setQuery]=useState(""); const [filter,setFilter]=useState("all");
  const [loading,setLoading]=useState(true); const [working,setWorking]=useState(""); const [notice,setNotice]=useState(""); const [error,setError]=useState(""); const [copied,setCopied]=useState(false);

  const load=useCallback(async()=>{setLoading(true);setError("");try{const payload=await apiJson("/api/employees",{cache:"no-store"});setItems(payload.data);}catch(failure){setError(failure.message);}finally{setLoading(false);}},[]);
  useEffect(()=>{load();},[load]);
  const visible=useMemo(()=>items.filter(item=>(filter==="all"||item.approvalStatus===filter)&&`${item.name} ${item.email} ${item.department} ${item.role} ${item.requestedRole}`.toLowerCase().includes(query.toLowerCase())),[items,filter,query]);
  const pendingCount=items.filter(item=>item.approvalStatus==="pending").length;

  async function decide(item,approvalStatus){setWorking(item.id);setNotice("");setError("");try{const payload=await apiJson("/api/employees",{method:"PATCH",body:JSON.stringify({id:item.id,approvalStatus})});setItems(current=>current.map(profile=>profile.id===item.id?{...profile,...payload.data}:profile));setNotice(payload.message);}catch(failure){setError(failure.message);}finally{setWorking("");}}
  async function copySignup(){await navigator.clipboard.writeText(`${window.location.origin}/signup/employee`);setCopied(true);setTimeout(()=>setCopied(false),2000);}

  return <>
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-extrabold sm:text-4xl">{isAdmin?"Users & approvals":"Employees"}</h1><p className="mt-2 text-slate-500">{isAdmin?`${pendingCount} account request${pendingCount===1?"":"s"} waiting for review.`:"Approved workforce accounts and departments."}</p></div>{isAdmin&&<button onClick={copySignup} className="btn-primary rounded-full px-6 py-3">{copied?<Check className="h-5 w-5"/>:<Copy className="h-5 w-5"/>}{copied?"Link copied":"Copy employee signup link"}</button>}</div>
    {notice&&<p className="mb-5 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{notice}</p>}{error&&<p className="mb-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>}
    {isAdmin&&<div className="mb-5 grid gap-4 sm:grid-cols-4"><div className="card p-5"><p className="text-xs uppercase tracking-widest text-slate-500">Total users</p><strong className="mt-2 block text-3xl">{items.length}</strong></div><div className="card p-5"><p className="text-xs uppercase tracking-widest text-amber-600">Pending</p><strong className="mt-2 block text-3xl text-amber-600">{pendingCount}</strong></div><div className="card p-5"><p className="text-xs uppercase tracking-widest text-emerald-600">Approved</p><strong className="mt-2 block text-3xl text-emerald-600">{items.filter(item=>item.approvalStatus==="approved").length}</strong></div><div className="card p-5"><p className="text-xs uppercase tracking-widest text-rose-600">Rejected</p><strong className="mt-2 block text-3xl text-rose-600">{items.filter(item=>item.approvalStatus==="rejected").length}</strong></div></div>}
    <section className="card p-5"><div className="flex flex-wrap gap-3"><label className="relative min-w-[260px] flex-1"><Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"/><input value={query} onChange={event=>setQuery(event.target.value)} className="input py-3 pl-12" placeholder="Search by name, email, department or role"/></label><button onClick={load} className="btn-secondary"><RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/>Refresh</button></div>
      {isAdmin&&<div className="mt-4 flex flex-wrap gap-2">{filters.map(value=><button key={value} onClick={()=>setFilter(value)} className={filter===value?"btn-primary rounded-full py-2 capitalize":"btn-secondary rounded-full py-2 capitalize"}>{value}{value==="pending"&&pendingCount?` (${pendingCount})`:""}</button>)}</div>}
      <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left"><thead><tr className="border-b text-xs uppercase tracking-widest text-slate-500"><th className="px-3 py-4">Account</th><th className="px-3">Requested role</th><th className="px-3">Active role</th><th className="px-3">Department</th><th className="px-3">Account status</th>{isAdmin&&<th className="px-3 text-right">Actions</th>}</tr></thead><tbody>{visible.map(item=><tr key={item.id} className="border-b last:border-0"><td className="px-3 py-4"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-blue-100 font-bold text-blue-700">{item.name.charAt(0).toUpperCase()}</span><div><strong>{item.name}</strong><p className="text-xs text-slate-500">{item.email}</p></div></div></td><td className="px-3 capitalize">{item.requestedRole}</td><td className="px-3 capitalize"><span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-blue-600"/>{item.role}</span></td><td className="px-3">{item.department}</td><td className="px-3"><Badge status={item.approvalStatus}/></td>{isAdmin&&<td className="px-3"><div className="flex justify-end gap-2">{item.approvalStatus!=="approved"&&<button disabled={working===item.id} onClick={()=>decide(item,"approved")} className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><UserCheck className="h-4 w-4"/>Approve</button>}{item.approvalStatus!=="rejected"&&<button disabled={working===item.id} onClick={()=>decide(item,"rejected")} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"><UserX className="h-4 w-4"/>Reject</button>}</div></td>}</tr>)}</tbody></table>{!loading&&!visible.length&&<div className="py-14 text-center"><p className="font-bold">No accounts in this view</p><p className="mt-1 text-sm text-slate-500">New manager and administrator registrations appear as pending.</p></div>}</div>
    </section>
  </>;
}
