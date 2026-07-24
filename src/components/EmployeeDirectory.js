"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, RefreshCw, Search, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { apiJson } from "@/lib/apiClient";
import { useAccess } from "@/components/AccessContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

const filters = ["all", "pending", "approved", "rejected"];
const statusStyle = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700"
};

function Badge({ status }) {
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold capitalize ${statusStyle[status] || statusStyle.pending}`}>{status}</span>;
}

export default function EmployeeDirectory() {
  const access = useAccess();
  const canManageRoles = hasPermission(access, PERMISSIONS.rolesManage);
  const canManageTeams = canManageRoles || hasPermission(access, PERMISSIONS.teamsManage);
  const canManageAccounts = hasPermission(access, PERMISSIONS.employeesManage);
  const [items, setItems] = useState([]);
  const [roles, setRoles] = useState([]);
  const [teams, setTeams] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const employeePayload = await apiJson("/api/employees", { cache: "no-store" });
      setItems(employeePayload.data);
      if (canManageRoles || canManageTeams) {
        const rbacPayload = await apiJson("/api/rbac", { cache: "no-store" });
        setRoles(rbacPayload.data.roles.filter(role => role.isActive));
        setTeams(rbacPayload.data.teams);
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, [canManageRoles, canManageTeams]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => items.filter(item =>
    (filter === "all" || item.approvalStatus === filter)
    && `${item.name} ${item.email} ${item.department} ${item.dynamicRole?.name || ""} ${item.teams?.map(team => team.name).join(" ")}`.toLowerCase().includes(query.toLowerCase())
  ), [items, filter, query]);
  const pendingCount = items.filter(item => item.approvalStatus === "pending").length;

  async function decide(item, approvalStatus) {
    setWorking(item.id);
    setNotice("");
    setError("");
    try {
      const payload = await apiJson("/api/employees", { method: "PATCH", body: JSON.stringify({ id: item.id, approvalStatus }) });
      setItems(current => current.map(profile => profile.id === item.id ? { ...profile, ...payload.data } : profile));
      setNotice(payload.message);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setWorking("");
    }
  }

  async function assign(item, entity, value) {
    setWorking(item.id);
    setError("");
    try {
      const payload = await apiJson("/api/rbac", {
        method: "PATCH",
        body: JSON.stringify(entity === "userRole"
          ? { entity, userId: item.id, roleId: value }
          : { entity, userId: item.id, teamId: value || null })
      });
      setNotice(payload.message);
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setWorking("");
    }
  }

  async function copySignup() {
    await navigator.clipboard.writeText(`${window.location.origin}/signup/employee`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return <>
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-3xl font-extrabold sm:text-4xl">Users</h1><p className="mt-2 text-slate-500">{pendingCount} account request{pendingCount === 1 ? "" : "s"} waiting for review.</p></div>
      {canManageAccounts && <button onClick={copySignup} className="btn-primary rounded-full px-6 py-3">{copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}{copied ? "Link copied" : "Copy signup link"}</button>}
    </div>
    {notice && <p className="mb-5 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{notice}</p>}
    {error && <p className="mb-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>}
    <section className="card p-5">
      <div className="flex flex-wrap gap-3"><label className="relative min-w-[240px] flex-1"><Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} className="input py-3 pl-12" placeholder="Search name, role, team, or department" /></label><button onClick={load} className="btn-secondary"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button></div>
      {canManageAccounts && <div className="mt-4 flex flex-wrap gap-2">{filters.map(value => <button key={value} onClick={() => setFilter(value)} className={filter === value ? "btn-primary rounded-full py-2 capitalize" : "btn-secondary rounded-full py-2 capitalize"}>{value}{value === "pending" && pendingCount ? ` (${pendingCount})` : ""}</button>)}</div>}
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead><tr className="border-b text-xs uppercase tracking-widest text-slate-500"><th className="px-3 py-4">Account</th><th className="px-3">Dynamic role</th><th className="px-3">Team</th><th className="px-3">Department</th><th className="px-3">Status</th>{canManageAccounts && <th className="px-3 text-right">Approval</th>}</tr></thead>
          <tbody>{visible.map(item => <tr key={item.id} className="border-b last:border-0">
            <td className="px-3 py-4"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-blue-100 font-bold text-blue-700">{item.name.charAt(0).toUpperCase()}</span><div><strong>{item.name}</strong><p className="text-xs text-slate-500">{item.email}</p></div></div></td>
            <td className="min-w-48 px-3">{canManageRoles ? <select disabled={working === item.id || item.id === access?.profile?.id} value={item.dynamicRole?.id || ""} onChange={event => assign(item, "userRole", event.target.value)} className="input py-2"><option value="" disabled>No role</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select> : <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-blue-600" />{item.dynamicRole?.name || "No role assigned"}</span>}</td>
            <td className="min-w-48 px-3">{canManageTeams ? <select disabled={working === item.id} value={item.teams?.[0]?.id || ""} onChange={event => assign(item, "userTeam", event.target.value)} className="input py-2"><option value="">No team</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select> : item.teams?.map(team => team.name).join(", ") || "No team"}</td>
            <td className="px-3">{item.department}</td>
            <td className="px-3"><Badge status={item.approvalStatus} /></td>
            {canManageAccounts && <td className="px-3"><div className="flex justify-end gap-2">{item.approvalStatus !== "approved" && <button disabled={working === item.id} onClick={() => decide(item, "approved")} className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><UserCheck className="h-4 w-4" />Approve</button>}{item.approvalStatus !== "rejected" && <button disabled={working === item.id} onClick={() => decide(item, "rejected")} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"><UserX className="h-4 w-4" />Reject</button>}</div></td>}
          </tr>)}</tbody>
        </table>
        {!loading && !visible.length && <div className="py-14 text-center"><p className="font-bold">No users in this view</p></div>}
      </div>
    </section>
  </>;
}
