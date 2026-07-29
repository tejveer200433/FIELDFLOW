import { Laptop, WifiOff } from "lucide-react";
import { formatDateTime, formatRelativeTime } from "@/lib/activity/formatters";
import { isHeartbeatStale } from "@/lib/activity/status";
import ActivityEmptyState from "@/components/activity/ActivityEmptyState";

function displayStatus(device, heartbeat, interval) {
  if (device.status !== "active") return device.status;
  const matchingHeartbeat = heartbeat?.deviceId === device.deviceId ? heartbeat : null;
  const lastSignalAt = matchingHeartbeat?.recordedAt || device.lastSeenAt;
  if (matchingHeartbeat?.onlineStatus === "offline" || isHeartbeatStale(lastSignalAt, interval)) return "offline";
  return device.status;
}

export default function ActivityDeviceList({ devices, heartbeat, heartbeatIntervalSeconds }) {
  return <section className="card p-5 sm:p-6">
    <div><h2 className="font-bold">Registered devices</h2><p className="mt-1 text-sm text-slate-500">Devices registered by the FieldFlow desktop agent.</p></div>
    {!devices.length
      ? <div className="mt-5"><ActivityEmptyState title="No registered devices" description="Install and register the desktop agent before starting an activity session." /></div>
      : <div className="mt-5 divide-y divide-slate-100">
        {devices.map(device => {
          const status = displayStatus(device, heartbeat, heartbeatIntervalSeconds);
          return <article key={device.deviceId} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${status === "offline" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>{status === "offline" ? <WifiOff className="h-5 w-5" /> : <Laptop className="h-5 w-5" />}</span>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{device.deviceName}</h3><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize text-slate-600">{status}</span></div>
              <p className="mt-1 text-sm text-slate-500">{device.platform}{device.operatingSystemVersion ? ` · ${device.operatingSystemVersion}` : ""} · Agent {device.agentVersion}</p>
              <p className="mt-2 text-xs text-slate-500">Registered {formatDateTime(device.registeredAt)} · Last seen {formatRelativeTime(device.lastSeenAt)}</p>
              {device.revokedAt && <p className="mt-1 text-xs text-rose-600">Revoked {formatDateTime(device.revokedAt)}</p>}
            </div>
          </article>;
        })}
      </div>}
  </section>;
}
