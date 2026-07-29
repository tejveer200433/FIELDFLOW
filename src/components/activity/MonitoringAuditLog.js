import AdminActivityEmptyState from "@/components/activity/AdminActivityEmptyState";

export default function MonitoringAuditLog() {
  return <section className="card p-5"><h2 className="font-bold">Monitoring audit log</h2><p className="mt-1 text-sm text-slate-500">Administrative policy and device events.</p><div className="mt-4"><AdminActivityEmptyState title="Audit read API unavailable" description="Append-only events exist, but Phase 2 does not expose a safe audit read endpoint. Raw metadata is not rendered." /></div></section>;
}
