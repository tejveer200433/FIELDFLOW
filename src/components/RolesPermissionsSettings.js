"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ClipboardList, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, UsersRound, X } from "lucide-react";
import { apiJson } from "@/lib/apiClient";
import { useAccess } from "@/components/AccessContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

const emptyRole = { id: "", name: "", description: "", isActive: true, permissionIds: [] };
const emptyTeam = { id: "", name: "", description: "", supervisorId: "", memberIds: [] };

function Modal({ title, onClose, children, wide = false }) {
  return <div className="fixed inset-0 z-[1000] grid place-items-center overflow-y-auto bg-slate-950/55 p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section role="dialog" aria-modal="true" aria-label={title} className={`my-5 max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7 ${wide ? "max-w-4xl" : "max-w-xl"}`}>
      <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-bold">{title}</h2><button onClick={onClose} aria-label="Close" className="icon-button"><X className="h-5 w-5" /></button></div>
      <div className="mt-5">{children}</div>
    </section>
  </div>;
}

function Status({ active }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{active ? "Active" : "Inactive"}</span>;
}

function DeleteRoleConfirmation({ role, busy, onClose, onConfirm }) {
  if (!role) return null;
  return <Modal title="Delete role?" onClose={busy ? () => {} : onClose}>
    <div className="flex gap-3 rounded-2xl bg-rose-50 p-4 text-rose-800">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
      <div><p className="font-bold">This action is permanent.</p><p className="mt-1 text-sm">The custom role <strong>{role.name}</strong> and its permission setup will be deleted. A role assigned to users cannot be deleted until those users are reassigned.</p></div>
    </div>
    <div className="mt-6 flex justify-end gap-3">
      <button disabled={busy} onClick={onClose} className="btn-secondary">Cancel</button>
      <button disabled={busy} onClick={onConfirm} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 font-bold text-white hover:bg-rose-700 disabled:opacity-60"><Trash2 className="h-4 w-4" />{busy ? "Deleting…" : "Delete role"}</button>
    </div>
  </Modal>;
}

export default function RolesPermissionsSettings() {
  const access = useAccess();
  const isOwner = Boolean(access?.isOwner);
  const canManageRoles = hasPermission(access, PERMISSIONS.rolesManage);
  const canManageTeams = canManageRoles || hasPermission(access, PERMISSIONS.teamsManage);
  const [data, setData] = useState({ roles: [], permissions: [], users: [], teams: [], auditLog: [] });
  const [tab, setTab] = useState("roles");
  const [roleForm, setRoleForm] = useState(null);
  const [deleteRole, setDeleteRole] = useState(null);
  const [teamForm, setTeamForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const payload = await apiJson("/api/rbac", { cache: "no-store" });
      setData(payload.data);
    } catch (failure) {
      setError(failure.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const permissionGroups = useMemo(() => data.permissions.reduce((groups, permission) => {
    if (!groups[permission.groupName]) groups[permission.groupName] = [];
    groups[permission.groupName].push(permission);
    return groups;
  }, {}), [data.permissions]);

  async function request(method, body, success) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = await apiJson("/api/rbac", { method, body: JSON.stringify(body) });
      setMessage(payload.message || success);
      setRoleForm(null);
      setTeamForm(null);
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function openRole(role = null) {
    setRoleForm(role ? {
      id: role.id,
      name: role.name,
      description: role.description,
      isActive: role.isActive,
      permissionIds: role.permissionIds
    } : { ...emptyRole });
  }

  function openTeam(team = null) {
    setTeamForm(team ? {
      id: team.id,
      name: team.name,
      description: team.description,
      supervisorId: team.supervisorId || "",
      memberIds: team.members.map(member => member.id)
    } : { ...emptyTeam });
  }

  function togglePermission(permissionId) {
    setRoleForm(current => ({
      ...current,
      permissionIds: current.permissionIds.includes(permissionId)
        ? current.permissionIds.filter(id => id !== permissionId)
        : [...current.permissionIds, permissionId]
    }));
  }

  function toggleMember(userId) {
    setTeamForm(current => ({
      ...current,
      memberIds: current.memberIds.includes(userId)
        ? current.memberIds.filter(id => id !== userId)
        : [...current.memberIds, userId]
    }));
  }

  async function saveRole(event) {
    event.preventDefault();
    await request(roleForm.id ? "PATCH" : "POST", {
      entity: "role",
      id: roleForm.id || undefined,
      name: roleForm.name,
      description: roleForm.description,
      isActive: roleForm.isActive,
      permissionIds: roleForm.permissionIds
    }, "Role saved.");
  }

  async function saveTeam(event) {
    event.preventDefault();
    await request(teamForm.id ? "PATCH" : "POST", {
      entity: "team",
      id: teamForm.id || undefined,
      name: teamForm.name,
      description: teamForm.description,
      supervisorId: teamForm.supervisorId || null,
      memberIds: teamForm.memberIds
    }, "Team saved.");
  }

  async function assignUser(userId, entity, value) {
    await request("PATCH", entity === "userRole"
      ? { entity, userId, roleId: value }
      : { entity, userId, teamId: value || null }, "User access updated.");
  }

  async function removeRole() {
    if (!deleteRole) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = await apiJson("/api/rbac", { method: "DELETE", body: JSON.stringify({ entity: "role", id: deleteRole.id }) });
      setDeleteRole(null);
      setMessage(payload.message);
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const tabs = [
    ["roles", "Roles & permissions", ShieldCheck],
    ["users", "User assignments", UsersRound],
    ["teams", "Teams", ClipboardList],
    ...(isOwner ? [["audit", "Audit log", Check]] : [])
  ];

  return <>
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-3xl font-extrabold sm:text-4xl">Roles & Permissions</h1><p className="mt-2 text-slate-500">Create roles from permission building blocks and control team-scoped access.</p></div>
      <button onClick={load} className="btn-secondary"><RefreshCw className="h-4 w-4" />Refresh</button>
    </div>

    {message && <p className="mb-5 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</p>}
    {error && <p className="mb-5 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p>}

    <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
      {tabs.map(([value, label, Icon]) => <button key={value} onClick={() => setTab(value)} className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold ${tab === value ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}><Icon className="h-4 w-4" />{label}</button>)}
    </div>

    {tab === "roles" && <section>
      <div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-bold">Workspace roles</h2><p className="text-sm text-slate-500">These roles are loaded from the database.</p></div>{canManageRoles && <button onClick={() => openRole()} className="btn-primary"><Plus className="h-4 w-4" />Create role</button>}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        {data.roles.map(role => <article key={role.id} className="card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold">{role.name}</h3><Status active={role.isActive} />{role.isSystem && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">System template</span>}</div><p className="mt-2 text-sm leading-6 text-slate-500">{role.description || "No description"}</p></div>{canManageRoles && !(role.isSystem && role.name.toLowerCase() === "owner") && <div className="flex flex-wrap justify-end gap-1"><button aria-label={`Edit ${role.name}`} onClick={() => openRole(role)} className="icon-button"><Pencil className="h-4 w-4" /></button>{!role.isSystem && <button aria-label={`Delete ${role.name}`} onClick={() => setDeleteRole(role)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" />Delete</button>}</div>}</div>
          <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs uppercase tracking-wider text-slate-500">Permissions</p><strong className="mt-1 block text-xl">{role.permissionIds.length}</strong></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs uppercase tracking-wider text-slate-500">Users</p><strong className="mt-1 block text-xl">{role.userCount}</strong></div></div>
          <div className="mt-4 flex flex-wrap gap-1.5">{role.permissionKeys.slice(0, 8).map(key => <span key={key} className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{key}</span>)}{role.permissionKeys.length > 8 && <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">+{role.permissionKeys.length - 8} more</span>}</div>
        </article>)}
      </div>
    </section>}

    {tab === "users" && <section className="card overflow-x-auto">
      <div className="border-b px-5 py-4"><h2 className="font-bold">User role and team assignments</h2><p className="text-sm text-slate-500">Changes apply immediately to API and database access.</p></div>
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500"><tr><th className="px-5 py-4">User</th><th>Dynamic role</th><th>Primary team</th></tr></thead>
        <tbody>{data.users.map(user => <tr key={user.id} className="border-t"><td className="px-5 py-4"><strong>{user.name}</strong><p className="text-xs text-slate-500">{user.email}</p></td><td className="min-w-52 pr-4"><select disabled={!canManageRoles || user.id === access?.profile?.id} value={user.dynamicRole?.id || ""} onChange={event => assignUser(user.id, "userRole", event.target.value)} className="input py-2"><option value="" disabled>No role assigned</option>{data.roles.filter(role => role.isActive).map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></td><td className="min-w-52 pr-5"><select disabled={!canManageTeams} value={user.teams[0]?.id || ""} onChange={event => assignUser(user.id, "userTeam", event.target.value)} className="input py-2"><option value="">No team</option>{data.teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></td></tr>)}</tbody>
      </table>
    </section>}

    {tab === "teams" && <section>
      <div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-bold">Teams</h2><p className="text-sm text-slate-500">Supervisors receive team scope only when their role contains a team permission.</p></div>{canManageTeams && <button onClick={() => openTeam()} className="btn-primary"><Plus className="h-4 w-4" />Create team</button>}</div>
      <div className="grid gap-4 lg:grid-cols-2">{data.teams.map(team => <article key={team.id} className="card p-5 sm:p-6"><div className="flex items-start justify-between"><div><h3 className="text-lg font-bold">{team.name}</h3><p className="mt-1 text-sm text-slate-500">{team.description || "No description"}</p></div>{canManageTeams && <button onClick={() => openTeam(team)} className="icon-button"><Pencil className="h-4 w-4" /></button>}</div><div className="mt-5 rounded-xl bg-blue-50 p-3"><p className="text-xs font-bold uppercase tracking-wider text-blue-600">Supervisor</p><p className="mt-1 font-semibold text-blue-950">{team.supervisor?.name || "Not assigned"}</p></div><p className="mt-4 text-sm font-bold">{team.members.length} team member{team.members.length === 1 ? "" : "s"}</p><div className="mt-2 flex flex-wrap gap-2">{team.members.map(member => <span key={member.id} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold">{member.name}</span>)}</div></article>)}</div>
    </section>}

    {tab === "audit" && isOwner && <section className="card overflow-x-auto"><div className="border-b px-5 py-4"><h2 className="font-bold">Recent access changes</h2></div><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500"><tr><th className="px-5 py-4">When</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead><tbody>{data.auditLog.map(item => <tr key={item.id} className="border-t"><td className="px-5 py-4">{new Date(item.createdAt).toLocaleString()}</td><td>{item.actor}</td><td className="capitalize">{item.action}</td><td>{item.targetType}</td></tr>)}</tbody></table></section>}

    {roleForm && <Modal title={roleForm.id ? `Edit ${roleForm.name}` : "Create role"} onClose={() => setRoleForm(null)} wide>
      <form onSubmit={saveRole}>
        <div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Role name</span><input required minLength={2} maxLength={100} className="input" value={roleForm.name} onChange={event => setRoleForm(current => ({ ...current, name: event.target.value }))} /></label><label><span className="label">Status</span><select className="input" value={roleForm.isActive ? "active" : "inactive"} onChange={event => setRoleForm(current => ({ ...current, isActive: event.target.value === "active" }))}><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div>
        <label className="mt-4 block"><span className="label">Description</span><textarea className="input min-h-20" value={roleForm.description} onChange={event => setRoleForm(current => ({ ...current, description: event.target.value }))} /></label>
        <div className="mt-6"><h3 className="font-bold">Permissions</h3><p className="text-sm text-slate-500">Select only the capabilities this role needs.</p><div className="mt-4 grid gap-4 md:grid-cols-2">{Object.entries(permissionGroups).map(([group, permissions]) => <fieldset key={group} className="rounded-2xl border border-slate-200 p-4"><legend className="px-2 text-sm font-bold">{group}</legend><div className="space-y-3">{permissions.map(permission => <label key={permission.id} className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={roleForm.permissionIds.includes(permission.id)} onChange={() => togglePermission(permission.id)} className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600" /><span><strong className="block text-sm">{permission.name}</strong><span className="block text-xs text-slate-500">{permission.key}</span></span></label>)}</div></fieldset>)}</div></div>
        <button disabled={busy} className="btn-primary mt-6 w-full py-3">{busy ? "Saving…" : "Save role"}</button>
      </form>
    </Modal>}

    {teamForm && <Modal title={teamForm.id ? `Edit ${teamForm.name}` : "Create team"} onClose={() => setTeamForm(null)} wide>
      <form onSubmit={saveTeam}>
        <div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Team name</span><input required minLength={2} maxLength={120} className="input" value={teamForm.name} onChange={event => setTeamForm(current => ({ ...current, name: event.target.value }))} /></label><label><span className="label">Supervisor</span><select className="input" value={teamForm.supervisorId} onChange={event => setTeamForm(current => ({ ...current, supervisorId: event.target.value }))}><option value="">Select supervisor</option>{data.users.filter(user => user.active && user.approvalStatus === "approved").map(user => <option key={user.id} value={user.id}>{user.name} · {user.dynamicRole?.name || "No role"}</option>)}</select></label></div>
        <label className="mt-4 block"><span className="label">Description</span><textarea className="input min-h-20" value={teamForm.description} onChange={event => setTeamForm(current => ({ ...current, description: event.target.value }))} /></label>
        <fieldset className="mt-5 rounded-2xl border border-slate-200 p-4"><legend className="px-2 font-bold">Team members</legend><div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">{data.users.filter(user => user.active && user.approvalStatus === "approved").map(user => <label key={user.id} className="flex cursor-pointer items-center gap-3 rounded-xl p-2 hover:bg-slate-50"><input type="checkbox" checked={teamForm.memberIds.includes(user.id)} onChange={() => toggleMember(user.id)} className="h-4 w-4 rounded border-slate-300 text-blue-600" /><span><strong className="block text-sm">{user.name}</strong><span className="block text-xs text-slate-500">{user.dynamicRole?.name || "No role"}</span></span></label>)}</div></fieldset>
        <button disabled={busy} className="btn-primary mt-6 w-full py-3">{busy ? "Saving…" : "Save team"}</button>
      </form>
    </Modal>}
    <DeleteRoleConfirmation role={deleteRole} busy={busy} onClose={() => setDeleteRole(null)} onConfirm={removeRole} />
  </>;
}
