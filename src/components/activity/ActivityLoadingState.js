import { LoaderCircle } from "lucide-react";

export default function ActivityLoadingState({ label = "Loading activity…" }) {
  return <section className="card flex min-h-32 items-center justify-center gap-3 p-6 text-sm text-slate-500">
    <LoaderCircle className="h-5 w-5 animate-spin text-blue-600" />
    <span>{label}</span>
  </section>;
}
