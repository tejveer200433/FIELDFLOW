import { Shield } from "lucide-react";

const collected = [
  "Work-session start and stop times", "Active and idle duration", "Keyboard activity counts",
  "Mouse activity counts", "Active application name when enabled", "Device online status", "Agent version"
];
const notCollected = [
  "Actual typed characters", "Passwords", "Key names or key codes", "Clipboard contents",
  "Mouse coordinates", "Personal message contents", "Screenshots", "Browser history",
  "Window titles", "Full file paths"
];

export default function ActivityPrivacyNotice() {
  return <details className="card group p-5 sm:p-6">
    <summary className="flex cursor-pointer list-none items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-blue-600"><Shield className="h-5 w-5" /></span><div><h2 className="font-bold">What activity tracking records</h2><p className="text-sm text-slate-500">Open this notice to review collected and excluded information.</p></div><span className="ml-auto text-slate-400 group-open:rotate-180">⌄</span></summary>
    <div className="mt-5 grid gap-5 md:grid-cols-2">
      <div><h3 className="font-semibold text-emerald-700">Collected during an active session</h3><ul className="mt-3 space-y-2 text-sm text-slate-600">{collected.map(item => <li key={item}>• {item}</li>)}</ul></div>
      <div><h3 className="font-semibold text-rose-700">Not collected</h3><ul className="mt-3 space-y-2 text-sm text-slate-600">{notCollected.map(item => <li key={item}>• {item}</li>)}</ul></div>
    </div>
    <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
      <p>Tracking runs only during an active work session. The desktop agent must visibly show when tracking is active.</p>
      <p className="mt-2">This web page cannot monitor system-wide activity. Employees can view their own collected records here.</p>
    </div>
  </details>;
}
