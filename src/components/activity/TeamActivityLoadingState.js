import { LoaderCircle } from "lucide-react";

export default function TeamActivityLoadingState({ label = "Loading team activity…" }) {
  return <div className="card flex min-h-40 items-center justify-center gap-3 p-6 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin text-blue-600" />{label}</div>;
}
