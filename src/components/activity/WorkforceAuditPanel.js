import { ScrollText } from "lucide-react";
import AdminActivityEmptyState from "@/components/activity/AdminActivityEmptyState";

export default function WorkforceAuditPanel() {
  return <section className="card p-5 sm:p-6"><div className="mb-4 flex items-center gap-3"><ScrollText className="h-5 w-5 text-blue-600" /><div><h2 className="font-bold">Monitoring audit history</h2><p className="text-sm text-slate-500">Safe policy, device, session, acknowledgement, and ingestion events.</p></div></div><AdminActivityEmptyState title="Audit read API unavailable" description="Phase 2 records append-only audit events but does not expose an authorised audit-log read endpoint. No metadata is fetched or fabricated." /></section>;
}
