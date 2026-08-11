import { AlertTriangle, RefreshCw } from "lucide-react";

export default function TeamActivityErrorState({ error, onRetry }) {
  const denied = error?.status === 403 || error?.code === "ACCESS_DENIED";
  return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <div className="flex-1"><h2 className="font-bold">{denied ? "Team activity access denied" : "Team activity unavailable"}</h2><p className="mt-1 text-sm">{error?.message || "The team activity request could not be completed."}</p>{error?.status === 429 && <p className="mt-1 text-xs">Please wait before refreshing again.</p>}</div>
      {onRetry && !denied && <button type="button" onClick={onRetry} className="btn-secondary"><RefreshCw className="h-4 w-4" />Retry</button>}
    </div>
  </div>;
}
