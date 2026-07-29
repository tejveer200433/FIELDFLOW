import AdminActivityEmptyState from "@/components/activity/AdminActivityEmptyState";

export default function MonitoringAcknowledgementSummary({ policy }) {
  return <section className="card p-5"><h2 className="font-bold">Acknowledgement summary</h2><p className="mt-1 text-sm text-slate-500">Active policy version: {policy?.policyVersion || "None"}</p><div className="mt-4"><AdminActivityEmptyState title="Acknowledgement summary API unavailable" description="Phase 2 supports employee acknowledgement writes but does not expose an administrative acknowledgement list or counts. Hashes are never displayed." /></div></section>;
}
