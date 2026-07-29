import { UsersRound } from "lucide-react";

export default function TeamActivityEmptyState({ filtered = false }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
    <UsersRound className="mx-auto h-8 w-8 text-slate-400" />
    <h2 className="mt-3 font-bold">{filtered ? "No employees match these filters" : "No supervised employees"}</h2>
    <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">{filtered ? "Reset or adjust the filters to see authorised team activity." : "Employees will appear when they are assigned to a team you supervise and your role has activity access."}</p>
  </div>;
}
