import { Laptop, WifiOff } from "lucide-react";

export default function TeamActivityDeviceStatus({ status, lastSeenAt }) {
  const offline = status === "offline";
  return <span title={lastSeenAt ? `Last update: ${lastSeenAt}` : "No device update"} className={`inline-flex items-center gap-1.5 text-xs font-semibold capitalize ${offline ? "text-amber-700" : status === "revoked" ? "text-rose-700" : "text-slate-600"}`}>
    {offline ? <WifiOff className="h-3.5 w-3.5" /> : <Laptop className="h-3.5 w-3.5" />}
    {status || "No device"}
  </span>;
}
