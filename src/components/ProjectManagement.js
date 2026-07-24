"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronRight, ExternalLink, FileText, FolderKanban, Plus, UsersRound, X } from "lucide-react";
import { apiJson } from "@/lib/apiClient";
import { useAccess } from "@/components/AccessContext";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

const projectStatuses = ["Planning", "Active", "On Hold", "Completed", "Cancelled"];
const Field = ({ label, children }) => <label className="block"><span className="label font-bold">{label}</span>{children}</label>;

function Badge({ value }) {
  const tone = value === "Completed" || value === "Approved"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : value === "Needs Changes" || value === "Urgent"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : value === "Submitted for Review" || value === "High"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-blue-200 bg-blue-50 text-blue-700";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${tone}`}>{value}</span>;
}

function Modal({ title, onClose, children, wide = false }) {
  return <div className="fixed inset-0 z-[1000] grid place-items-center overflow-y-auto bg-slate-950/55 p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className={`my-6 max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ${wide ? "max-w-4xl" : "max-w-xl"}`}>
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{title}</h2><button onClick={onClose} className="icon-button"><X /></button></div>
      <div className="mt-5">{children}</div>
    </section>
  </div>;
}

function ReviewControls({ busy, onReview }) {
  const [comment, setComment] = useState("");
  return <div className="mt-4 border-t border-blue-100 pt-4">
    <textarea value={comment} onChange={event => setComment(event.target.value)} className="input min-h-20 bg-white" placeholder="Reviewer feedback" />
    <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} onClick={() => onReview("Approved", comment)} className="btn-primary"><CheckCircle2 className="h-4 w-4" />Approve work</button><button disabled={busy} onClick={() => onReview("Needs Changes", comment)} className="btn-secondary">Request changes</button></div>
  </div>;
}

export default function ProjectManagement() {
  const access = useAccess();
  const canManage = hasPermission(access, PERMISSIONS.projectsManage);
  const canReview = hasPermission(access, PERMISSIONS.projectsReview);
  const [projects, setProjects] = useState([]);
  const [people, setPeople] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [projectModal, setProjectModal] = useState(false);
  const [moduleModal, setModuleModal] = useState(false);
  const [moduleTarget, setModuleTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const projectResult = await apiJson("/api/projects", { cache: "no-store" });
      const peopleResult = canManage ? await apiJson("/api/employees", { cache: "no-store" }) : { data: [] };
      setProjects(projectResult.data);
      setPeople(peopleResult.data.filter(item => item.active && item.approvalStatus === "approved"));
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }, [canManage]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = projects.find(item => item.id === selectedId) || null;
  const assignees = people.filter(item => item.permissions?.includes("projects.view_self"));
  const reviewers = people.filter(item => item.permissions?.includes("projects.review") || item.permissions?.includes("projects.manage"));
  const totals = useMemo(() => ({
    active: projects.filter(item => item.status === "Active").length,
    due: projects.filter(item => item.deadline && new Date(item.deadline) < new Date() && item.status !== "Completed").length,
    review: projects.flatMap(project => project.modules).flatMap(module => module.assignments).filter(assignment => assignment.status === "Submitted for Review").length
  }), [projects]);

  async function createProject(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = await apiJson("/api/projects", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      setProjectModal(false);
      setSelectedId(payload.data.id);
      setModuleTarget(null);
      setModuleModal(true);
      await load();
      setMessage("Project created. Add a module and assignment.");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function createModuleAssignment(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      let moduleId = moduleTarget?.id;
      if (!moduleId) {
        const modulePayload = await apiJson("/api/modules", { method: "POST", body: JSON.stringify({ projectId: selectedId, title: form.moduleTitle, description: form.moduleDescription, checklist: form.checklist }) });
        moduleId = modulePayload.data.id;
      }
      await apiJson("/api/assignments", {
        method: "POST",
        body: JSON.stringify({
          moduleId,
          employeeId: form.employeeId,
          reviewerId: form.reviewerId,
          startDate: form.startDate,
          deadline: new Date(form.deadline).toISOString(),
          priority: form.priority,
          notes: form.notes
        })
      });
      setModuleModal(false);
      setModuleTarget(null);
      setMessage("Module assignment saved.");
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateProject(status) {
    const payload = await apiJson("/api/projects", { method: "PATCH", body: JSON.stringify({ id: selected.id, status }) });
    setProjects(current => current.map(item => item.id === selected.id ? payload.data : item));
  }

  async function review(submission, decision, comment) {
    setBusy(true);
    setError("");
    try {
      await apiJson("/api/submissions", { method: "PATCH", body: JSON.stringify({ id: submission.id, decision, comment }) });
      setMessage(decision === "Approved" ? "Work approved and completed." : "Changes requested.");
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function openFile(file) {
    try {
      const payload = await apiJson(`/api/files?path=${encodeURIComponent(file.path)}`);
      window.open(payload.data.url, "_blank", "noopener,noreferrer");
    } catch (failure) {
      setError(failure.message);
    }
  }

  if (selected) return <>
    <button onClick={() => setSelectedId("")} className="mb-5 inline-flex items-center gap-2 font-bold text-blue-600"><ArrowLeft className="h-4 w-4" />All projects</button>
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex flex-wrap gap-2"><Badge value={selected.status} /><Badge value={selected.priority} /><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{selected.category}</span></div><h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">{selected.title}</h1><p className="mt-2 max-w-3xl text-slate-500">{selected.description || "No project description."}</p></div>
      {canManage && <div className="flex flex-wrap gap-2"><select value={selected.status} onChange={event => updateProject(event.target.value)} className="input w-auto">{projectStatuses.map(item => <option key={item}>{item}</option>)}</select><button onClick={() => { setModuleTarget(null); setModuleModal(true); }} className="btn-primary"><Plus />Add module</button></div>}
    </div>
    {message && <p className="mb-5 rounded-2xl bg-emerald-50 p-4 text-emerald-700">{message}</p>}
    {error && <p className="mb-5 rounded-2xl bg-rose-50 p-4 text-rose-700">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-4"><div className="card p-5"><p className="text-xs uppercase text-slate-500">Progress</p><strong className="text-2xl text-blue-700">{selected.progress}%</strong></div><div className="card p-5"><p className="text-xs uppercase text-slate-500">Modules</p><strong className="text-2xl">{selected.modules.length}</strong></div><div className="card p-5"><p className="text-xs uppercase text-slate-500">Start date</p><strong>{selected.startDate || "Not set"}</strong></div><div className="card p-5"><p className="text-xs uppercase text-slate-500">Deadline</p><strong>{selected.deadline || "Not set"}</strong></div></div>
    <section className="card mt-6 p-6"><div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-slate-500">Client</p><strong>{selected.clientCompany || "—"}</strong></div><div><p className="text-slate-500">Contact</p><strong>{selected.contactPerson || "—"}</strong></div><div><p className="text-slate-500">Project owner</p><strong>{selected.owner}</strong></div><div><p className="text-slate-500">Site</p><strong>{selected.siteAddress || "—"}</strong></div></div></section>
    <div className="mt-7 space-y-5">
      {selected.modules.map(module => <section key={module.id} className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-slate-50 p-5"><div><h2 className="text-xl font-bold">{module.title}</h2><p className="mt-1 text-sm text-slate-500">{module.description || "No module description."}</p></div>{canManage && <button onClick={() => { setModuleTarget(module); setModuleModal(true); }} className="btn-secondary"><UsersRound className="h-4 w-4" />Assign teammate</button>}</div>
        {module.checklist.length > 0 && <div className="border-b px-5 py-4"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Checklist</p><div className="mt-2 flex flex-wrap gap-2">{module.checklist.map(item => <span key={item} className="rounded-full bg-slate-100 px-3 py-1 text-xs">{item}</span>)}</div></div>}
        <div className="divide-y">{module.assignments.map(assignment => {
          const latest = assignment.submissions[0];
          return <div key={assignment.id} className="p-5"><div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr_auto]"><div><p className="font-bold">{assignment.employee}</p><p className="text-xs text-slate-500">Reviewed by {assignment.reviewer}</p></div><div><p className="text-xs text-slate-500">Schedule</p><p className="text-sm font-semibold">{assignment.startDate} → {new Date(assignment.deadline).toLocaleString()}</p></div><div><Badge value={assignment.status} /><p className="mt-2 text-xs text-slate-500">Priority: {assignment.priority}</p></div><div className="text-right text-sm font-bold text-blue-700">{assignment.checklistProgress.length}/{module.checklist.length} checks</div></div>
            {latest && <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><div className="flex flex-wrap justify-between gap-2"><strong>Submission v{latest.version}</strong><Badge value={latest.workStatus} /></div><p className="mt-2 text-sm">{latest.summary}</p>{latest.externalLink && <a href={latest.externalLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-blue-600"><ExternalLink className="h-4 w-4" />Work link</a>}<div className="mt-3 flex flex-wrap gap-2">{latest.files.map(file => <button key={file.id} onClick={() => openFile(file)} className="btn-secondary py-2 text-xs"><FileText className="h-4 w-4" />{file.name}</button>)}</div>{latest.workStatus === "Submitted for Review" && canReview && <ReviewControls busy={busy} onReview={(decision, comment) => review(latest, decision, comment)} />}{latest.reviewerComment && <p className="mt-3 rounded-xl bg-white p-3 text-sm"><strong>Reviewer:</strong> {latest.reviewerComment}</p>}</div>}
          </div>;
        })}{!module.assignments.length && <p className="p-5 text-sm text-slate-500">No assignments visible in your scope.</p>}</div>
      </section>)}
      {!selected.modules.length && <div className="card p-12 text-center"><FolderKanban className="mx-auto h-10 w-10 text-blue-500" /><h2 className="mt-3 font-bold">No modules available</h2></div>}
    </div>
    {moduleModal && canManage && <ModuleForm module={moduleTarget} assignees={assignees} reviewers={reviewers} busy={busy} onClose={() => { setModuleModal(false); setModuleTarget(null); }} onSubmit={createModuleAssignment} />}
  </>;

  return <>
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-extrabold sm:text-4xl">Projects & work orders</h1><p className="mt-2 text-slate-500">{canManage ? "Create projects, modules, and assignments." : "Review project work assigned to you."}</p></div>{canManage && <button onClick={() => setProjectModal(true)} className="btn-primary rounded-full px-7 py-4"><Plus />New project</button>}</div>
    {message && <p className="mb-5 rounded-2xl bg-emerald-50 p-4 text-emerald-700">{message}</p>}
    {error && <p className="mb-5 rounded-2xl bg-rose-50 p-4 text-rose-700">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-3"><div className="card p-5"><p className="text-xs uppercase text-slate-500">Active projects</p><strong className="text-3xl text-blue-700">{totals.active}</strong></div><div className="card p-5"><p className="text-xs uppercase text-slate-500">Awaiting review</p><strong className="text-3xl text-amber-600">{totals.review}</strong></div><div className="card p-5"><p className="text-xs uppercase text-slate-500">Past deadline</p><strong className="text-3xl text-rose-600">{totals.due}</strong></div></div>
    <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{projects.map(project => <button key={project.id} onClick={() => setSelectedId(project.id)} className="card p-6 text-left transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg"><div className="flex justify-between gap-3"><Badge value={project.status} /><Badge value={project.priority} /></div><h2 className="mt-4 text-xl font-bold">{project.title}</h2><p className="mt-1 text-sm text-slate-500">{project.clientCompany || project.category}</p><div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full bg-blue-600" style={{ width: `${project.progress}%` }} /></div><div className="mt-2 flex justify-between text-xs text-slate-500"><span>{project.progress}% complete</span><span>{project.modules.length} modules</span></div><div className="mt-5 flex justify-end border-t pt-4"><ChevronRight className="text-blue-600" /></div></button>)}{!projects.length && <div className="card col-span-full p-14 text-center"><FolderKanban className="mx-auto h-12 w-12 text-blue-500" /><h2 className="mt-4 text-xl font-bold">No projects available</h2><p className="mt-2 text-slate-500">Projects in your permitted scope will appear here.</p></div>}</div>
    {projectModal && canManage && <ProjectForm busy={busy} onClose={() => setProjectModal(false)} onSubmit={createProject} />}
  </>;
}

function ProjectForm({ busy, onClose, onSubmit }) {
  return <Modal title="Create project" onClose={onClose} wide><form onSubmit={onSubmit} className="space-y-5"><Field label="Project title"><input name="title" required autoFocus className="input" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Client / company"><input name="clientCompany" className="input" /></Field><Field label="Category"><select name="category" className="input"><option>Software</option><option>Visit</option><option>Installation</option><option>Service</option><option>Sales</option><option>Collection</option><option>Other</option></select></Field><Field label="Contact person"><input name="contactPerson" className="input" /></Field><Field label="Contact phone"><input name="contactPhone" className="input" /></Field></div><Field label="Site address"><input name="siteAddress" className="input" /></Field><Field label="Description"><textarea name="description" className="input min-h-24" /></Field><Field label="Expected outcome"><textarea name="expectedOutcome" className="input min-h-20" /></Field><div className="grid gap-4 sm:grid-cols-3"><Field label="Start date"><input name="startDate" type="date" className="input" /></Field><Field label="Deadline"><input name="deadline" type="date" className="input" /></Field><Field label="Priority"><select name="priority" defaultValue="Medium" className="input"><option>Low</option><option>Medium</option><option>High</option><option>Urgent</option></select></Field></div><button disabled={busy} className="btn-primary w-full py-4">{busy ? "Creating…" : "Create project"}</button></form></Modal>;
}

function ModuleForm({ module, assignees, reviewers, busy, onClose, onSubmit }) {
  return <Modal title={module ? `Assign teammate · ${module.title}` : "Create module & assign work"} onClose={onClose} wide><form onSubmit={onSubmit} className="space-y-5">{!module && <><Field label="Module / work title"><input name="moduleTitle" required className="input" /></Field><Field label="Work description"><textarea name="moduleDescription" className="input min-h-24" /></Field><Field label="Checklist (one item per line)"><textarea name="checklist" className="input min-h-28" /></Field></>}<div className="grid gap-4 sm:grid-cols-2"><Field label="Assign user"><select name="employeeId" required className="input"><option value="">Choose assignee</option>{assignees.map(item => <option key={item.id} value={item.id}>{item.name} · {item.dynamicRole?.name}</option>)}</select></Field><Field label="Reviewer"><select name="reviewerId" required className="input"><option value="">Choose reviewer</option>{reviewers.map(item => <option key={item.id} value={item.id}>{item.name} · {item.dynamicRole?.name}</option>)}</select></Field><Field label="Start date"><input name="startDate" required type="date" className="input" /></Field><Field label="Deadline and time"><input name="deadline" required type="datetime-local" className="input" /></Field><Field label="Priority"><select name="priority" className="input"><option>Low</option><option>Medium</option><option>High</option><option>Urgent</option></select></Field></div><Field label="Notes"><textarea name="notes" className="input min-h-20" /></Field><button disabled={busy || !assignees.length || !reviewers.length} className="btn-primary w-full py-4">{busy ? "Saving…" : module ? "Assign teammate" : "Create module & assignment"}</button></form></Modal>;
}
