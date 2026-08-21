"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Check, MonitorX, Shield, Trash2, X } from "lucide-react";
import { createWebAccessRule, deleteWebAccessRule, getExtensionHealth, getWebAccessEvents, getWebAccessRequests, getWebAccessRules, reviewWebAccessRequest, updateWebAccessRule } from "@/frontend/features/activity/api/webAccessClient";

const defaults = { name: "Work-hours restrictions", scopeType: "organisation", scopeId: "", scopeIds: [], enforcementEnabled: true, priority: 100, blockedCategories: ["social_media", "entertainment", "messaging"], blockedDomains: [], allowedDomains: [], blockedApplications: ["whatsapp", "whatsapp.root", "telegram", "snapchat", "instagram"], scheduleTimezone: "Asia/Kolkata", scheduleDays: [1,2,3,4,5], scheduleStart: "09:00", scheduleEnd: "18:00", requireManagedExtension: true, enabled: true };

function shortIdentifier(value) {
  if (!value) return "unavailable";
  return `${String(value).slice(0, 8)}…`;
}

export default function WebAccessAdministration({ allowRuleManagement = true, view = "all" }) {
  const [data, setData] = useState({ rules: [], canManageGlobally: true, scopes: { employees: [], teams: [], roles: [], devices: [] }, categories: [] });
  const [requests, setRequests] = useState([]); const [health, setHealth] = useState([]); const [events, setEvents] = useState([]);
  const [form, setForm] = useState(defaults); const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const results = await Promise.allSettled([getWebAccessRules(), getWebAccessRequests(), getExtensionHealth(), getWebAccessEvents()]);
    if (results[0].status === "fulfilled") {
      setData(results[0].value);
      if (!results[0].value.canManageGlobally) {
        setForm(current => ["organisation", "role"].includes(current.scopeType) ? { ...current, scopeType: "employee", scopeId: "", scopeIds: [] } : current);
      }
    }
    if (results[1].status === "fulfilled") setRequests(results[1].value.requests || []);
    if (results[2].status === "fulfilled") setHealth(results[2].value || []);
    if (results[3].status === "fulfilled") setEvents(results[3].value || []);
    const failed = results.find(result => result.status === "rejected"); if (failed) setError(failed.reason.message); else setError("");
  }, []);
  useEffect(() => { load(); const timer = window.setInterval(load, 30000); return () => window.clearInterval(timer); }, [load]);
  const employeeNames = useMemo(() => new Map(data.scopes.employees.map(item => [item.employeeId, item.name])), [data.scopes.employees]);
  const deviceDetails = useMemo(() => new Map(data.scopes.devices.map(item => [item.id, item])), [data.scopes.devices]);
  const teamNames = useMemo(() => new Map(data.scopes.teams.map(item => [item.id, item.name])), [data.scopes.teams]);
  const roleNames = useMemo(() => new Map(data.scopes.roles.map(item => [item.id, item.name])), [data.scopes.roles]);
  const employeeLabel = (employeeId, suppliedName = null) => suppliedName || employeeNames.get(employeeId) || `Unknown employee (${shortIdentifier(employeeId)})`;
  const deviceLabel = deviceId => deviceDetails.get(deviceId)?.device_name || `Unknown device (${shortIdentifier(deviceId)})`;
  const ruleScopeLabel = rule => {
    if (rule.scopeType === "organisation") return "Entire organisation";
    if (rule.scopeType === "employee") return employeeLabel(rule.scopeId);
    if (rule.scopeType === "device") return deviceLabel(rule.scopeId);
    if (rule.scopeType === "team") return teamNames.get(rule.scopeId) || `Unknown team (${shortIdentifier(rule.scopeId)})`;
    if (rule.scopeType === "role") return roleNames.get(rule.scopeId) || `Unknown role (${shortIdentifier(rule.scopeId)})`;
    return "Scope unavailable";
  };
  const scopeOptions = useMemo(() => {
    const options = form.scopeType === "employee" ? data.scopes.employees.map(item => ({ id: item.employeeId, name: item.name })) : form.scopeType === "device" ? data.scopes.devices.map(item => ({ id: item.id, name: `${item.device_name} — ${employeeNames.get(item.employee_id) || `Unknown employee (${shortIdentifier(item.employee_id)})`}` })) : form.scopeType === "team" ? data.scopes.teams : form.scopeType === "role" ? data.scopes.roles : [];
    return [...new Map(options.map(item => [item.id, item])).values()];
  }, [data, form.scopeType, employeeNames]);
  const multiTargetScope = ["employee", "role"].includes(form.scopeType);
  const targetMissing = form.scopeType !== "organisation" && (multiTargetScope ? !form.scopeIds.length : !form.scopeId);
  const pending = requests.filter(item => item.status === "Pending");
  const showRules = view === "all" || view === "rules";
  const showAlerts = view === "all" || view === "alerts";
  const eventSummary = useMemo(() => events.reduce((summary, item) => {
    summary.total += 1;
    if (item.event_type === "domain_blocked") summary.websites += 1;
    if (item.event_type === "application_blocked") summary.applications += 1;
    if (["extension_missing", "extension_disabled"].includes(item.event_type)) summary.extensionAlerts += 1;
    return summary;
  }, { total: 0, websites: 0, applications: 0, extensionAlerts: 0 }), [events]);

  async function saveRule(event) {
    event.preventDefault(); setBusy("rule"); setError("");
    try { const response = await createWebAccessRule(form); setNotice(response.message || "Scoped restriction policy created."); setForm(defaults); await load(); } catch (failure) { setError(failure.message); } finally { setBusy(""); }
  }
  async function review(item, decision, approvalScope = "once") {
    setBusy(item.id); try { await reviewWebAccessRequest({ id: item.id, decision, approvalScope, grantedMinutes: item.requestedMinutes, comment: decision === "Approved" ? "Approved for business use." : "Request rejected." }); await load(); } catch (failure) { setError(failure.message); } finally { setBusy(""); }
  }

  return <div className={`space-y-6 web-access-${view}`}>
    {(notice || error) && <p className={`rounded-xl p-3 text-sm ${error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{error || notice}</p>}
    {allowRuleManagement && showRules && <section className="card overflow-hidden"><div className="border-b p-5"><h2 className="flex items-center gap-2 font-bold"><Shield className="h-5 w-5 text-blue-600" />App and website access</h2><p className="mt-1 text-sm text-slate-500">Create an organisation restriction or a focused exception for an employee, team, role, or device.</p></div><form onSubmit={saveRule} className="grid gap-4 p-5 lg:grid-cols-3">
      <label><span className="label">Policy name</span><input className="input" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label>
      <label><span className="label">Who is restricted?</span><select className="input" value={form.scopeType} onChange={event => setForm(current => ({ ...current, scopeType: event.target.value, scopeId: "", scopeIds: [] }))}>{data.canManageGlobally && <option value="organisation">Entire organisation</option>}<option value="team">Team</option>{data.canManageGlobally && <option value="role">Role</option>}<option value="employee">Employee</option><option value="device">Device</option></select></label>
      {form.scopeType !== "organisation" && (multiTargetScope ? <fieldset className="rounded-xl border border-slate-200 p-3"><legend className="label px-1">Select {form.scopeType === "role" ? "roles" : "employees"}</legend><p className="mb-2 text-xs text-slate-500">{form.scopeIds.length} selected</p><div className="max-h-40 space-y-1 overflow-y-auto">{scopeOptions.map(item => <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"><input type="checkbox" checked={form.scopeIds.includes(item.id)} onChange={event => setForm(current => ({ ...current, scopeIds: event.target.checked ? [...current.scopeIds, item.id] : current.scopeIds.filter(id => id !== item.id) }))} />{item.name}</label>)}</div></fieldset> : <label><span className="label">Select scope</span><select required className="input" value={form.scopeId} onChange={event => setForm(current => ({ ...current, scopeId: event.target.value }))}><option value="">Select…</option>{scopeOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}
      <label><span className="label">Priority</span><input type="number" min="0" max="10000" className="input" value={form.priority} onChange={event => setForm(current => ({ ...current, priority: Number(event.target.value) }))} /></label>
      <label><span className="label">Start time</span><input type="time" className="input" value={form.scheduleStart} onChange={event => setForm(current => ({ ...current, scheduleStart: event.target.value }))} /></label><label><span className="label">End time</span><input type="time" className="input" value={form.scheduleEnd} onChange={event => setForm(current => ({ ...current, scheduleEnd: event.target.value }))} /></label>
      <label className="lg:col-span-3"><span className="label">Blocked domains (one per line)</span><textarea className="input min-h-20" value={form.blockedDomains.join("\n")} onChange={event => setForm(current => ({ ...current, blockedDomains: event.target.value.split("\n").filter(Boolean) }))} placeholder="youtube.com" /></label>
      <label className="lg:col-span-3"><span className="label">Always-allowed domains (one per line)</span><textarea className="input min-h-20" value={form.allowedDomains.join("\n")} onChange={event => setForm(current => ({ ...current, allowedDomains: event.target.value.split("\n").filter(Boolean) }))} placeholder="company.youtube.com" /></label>
      <label className="lg:col-span-3"><span className="label">Blocked desktop applications (executable name, one per line)</span><textarea className="input min-h-20" value={form.blockedApplications.join("\n")} onChange={event => setForm(current => ({ ...current, blockedApplications: event.target.value.split("\n").filter(Boolean) }))} /></label>
      <div className="lg:col-span-3"><span className="label">Blocked categories</span><div className="flex flex-wrap gap-3">{data.categories.map(category => <label key={category.key} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><input type="checkbox" checked={form.blockedCategories.includes(category.key)} onChange={event => setForm(current => ({ ...current, blockedCategories: event.target.checked ? [...current.blockedCategories, category.key] : current.blockedCategories.filter(key => key !== category.key) }))} />{category.name}</label>)}</div></div>
      <div className="lg:col-span-2"><span className="label">Active days</span><div className="flex flex-wrap gap-2">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day, index) => <label key={day} className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"><input type="checkbox" checked={form.scheduleDays.includes(index)} onChange={event => setForm(current => ({ ...current, scheduleDays: event.target.checked ? [...current.scheduleDays, index].sort() : current.scheduleDays.filter(value => value !== index) }))} />{day}</label>)}</div></div>
      <label><span className="label">Schedule timezone</span><input className="input" value={form.scheduleTimezone} onChange={event => setForm(current => ({ ...current, scheduleTimezone: event.target.value }))} /></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={form.enforcementEnabled} onChange={event => setForm(current => ({ ...current, enforcementEnabled: event.target.checked }))} />Restrict this scope</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.requireManagedExtension} onChange={event => setForm(current => ({ ...current, requireManagedExtension: event.target.checked }))} />Require browser extension</label>
      <p className="text-xs text-slate-500 lg:col-span-3">To exempt a team, employee, or device, create a higher-priority policy with “Restrict this scope” unchecked.</p>
      <div className="lg:col-span-3"><button disabled={busy === "rule" || targetMissing} className="btn-primary">Create scoped policy{multiTargetScope && form.scopeIds.length > 1 ? ` for ${form.scopeIds.length} targets` : ""}</button></div>
    </form><div className="divide-y border-t">{data.rules.map(rule => <article key={rule.id} className="flex flex-wrap items-center justify-between gap-3 p-5"><div><strong>{rule.name}</strong><p className="mt-0.5 text-sm font-semibold text-slate-700">{ruleScopeLabel(rule)}</p><p className="mt-1 text-xs capitalize text-slate-500">{rule.scopeType} policy · priority {rule.priority} · {rule.enforcementEnabled ? "restricted" : "unrestricted"} · {rule.scheduleStart}–{rule.scheduleEnd} · {rule.enabled ? "enabled" : "disabled"}</p></div><div className="flex gap-2"><button className="btn-secondary" onClick={async () => { await updateWebAccessRule({ ...rule, enabled: !rule.enabled }); await load(); }}>{rule.enabled ? "Disable" : "Enable"}</button><button className="btn-secondary text-rose-700" onClick={async () => { if (window.confirm(`Delete ${rule.name}?`)) { await deleteWebAccessRule(rule.id); await load(); } }}><Trash2 className="h-4 w-4" />Delete</button></div></article>)}</div></section>}
    <section className="card overflow-hidden"><div className="border-b p-5"><h2 className="font-bold">Access approval queue</h2><p className="text-sm text-slate-500">Approve once, for a shift, project, seven days, or always.</p></div><div className="divide-y">{pending.map(item => <article key={item.id} className="flex flex-wrap justify-between gap-4 p-5"><div><strong>{item.resourceKey}</strong><p className="text-xs text-slate-500">{item.resourceType} · {employeeLabel(item.employeeId, item.employeeName)}</p><p className="mt-2 text-sm">{item.reason}</p></div><div className="flex flex-wrap items-center gap-2"><select id={`scope-${item.id}`} className="input w-32" defaultValue={item.requestedScope}><option value="once">One-time</option><option value="shift">Shift</option><option value="project">Project</option><option value="seven_days">7 days</option><option value="always">Always</option></select><button disabled={busy === item.id} className="btn-primary" onClick={() => review(item, "Approved", document.getElementById(`scope-${item.id}`).value)}><Check className="h-4 w-4" />Approve</button><button disabled={busy === item.id} className="btn-secondary text-rose-700" onClick={() => review(item, "Rejected")}><X className="h-4 w-4" />Reject</button></div></article>)}{!pending.length && <p className="p-8 text-center text-sm text-slate-500">No pending requests.</p>}</div></section>
    <div className="grid gap-6 xl:grid-cols-2"><section className="card overflow-hidden"><div className="border-b p-5"><h2 className="flex items-center gap-2 font-bold"><MonitorX className="h-5 w-5 text-rose-600" />Extension health</h2><p className="text-sm text-slate-500">Missing or disabled extensions automatically alert managers and admins.</p></div><div className="divide-y">{health.map(item => <article key={item.id} className="flex justify-between gap-3 p-4 text-sm"><div><strong className="capitalize">{item.browserName}</strong><p className="mt-0.5 font-semibold text-slate-700">{employeeLabel(item.employeeId, item.employeeName)}</p><p className="mt-0.5 text-xs text-slate-500">Device: {deviceLabel(item.deviceId)}</p></div><span className={`h-fit rounded-full px-2 py-1 text-xs font-bold ${item.status === "installed" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{item.status}</span></article>)}{!health.length && <p className="p-8 text-center text-sm text-slate-500">No extension check-ins yet.</p>}</div></section>
      <section className="card overflow-hidden"><div className="border-b p-5"><h2 className="flex items-center gap-2 font-bold"><Activity className="h-5 w-5 text-blue-600" />Restriction analytics</h2><p className="text-sm text-slate-500">Privacy-safe domain/application events only.</p><div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs"><div><strong className="block text-lg">{eventSummary.total}</strong>Total</div><div><strong className="block text-lg">{eventSummary.websites}</strong>Web</div><div><strong className="block text-lg">{eventSummary.applications}</strong>Apps</div><div><strong className="block text-lg">{eventSummary.extensionAlerts}</strong>Extension</div></div></div><div className="divide-y">{events.slice(0,30).map(item => <article key={item.id} className="flex justify-between gap-3 p-4 text-sm"><div><strong>{item.resource_key}</strong><p className="text-xs text-slate-500">{item.event_type.replaceAll("_", " ")} · {employeeLabel(item.employee_id, item.employeeName)}</p></div><time className="text-xs text-slate-500">{new Date(item.occurred_at).toLocaleString()}</time></article>)}{!events.length && <p className="p-8 text-center text-sm text-slate-500">No restriction events yet.</p>}</div></section></div>
  </div>;
}
