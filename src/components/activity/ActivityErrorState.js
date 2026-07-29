import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ActivityErrorState({ error, onRetry }) {
  return <section role="alert" className="card border-rose-200 bg-rose-50 p-5">
    <div className="flex items-start gap-3">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
      <div className="min-w-0">
        <h2 className="font-bold text-rose-900">Activity information unavailable</h2>
        <p className="mt-1 text-sm text-rose-700">{error?.message || "The activity request could not be completed."}</p>
        {error?.code === "RATE_LIMITED" || error?.status === 429
          ? <p className="mt-1 text-xs text-rose-600">Please wait before refreshing again.</p>
          : null}
      </div>
      {onRetry && <button type="button" onClick={onRetry} className="btn-secondary ml-auto shrink-0">
        <RefreshCw className="h-4 w-4" />Retry
      </button>}
    </div>
  </section>;
}
