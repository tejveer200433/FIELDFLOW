import AdminActivityEmptyState from "@/components/activity/AdminActivityEmptyState";

export default function MonitoringPolicyHistory() {
  return <section className="card p-5"><h2 className="font-bold">Policy history</h2><p className="mt-1 text-sm text-slate-500">Historical policy versions are immutable.</p><div className="mt-4"><AdminActivityEmptyState title="Policy history API unavailable" description="Phase 2 returns only the active policy. Historical versions are not queried directly from Supabase." /></div></section>;
}
