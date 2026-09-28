"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { getDeviceScreenshotRequest, requestDeviceScreenshot } from "@/frontend/features/activity/api/policyClient";

export default function AndroidScreenshotRequest({ device, enabled }) {
  const [request, setRequest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try { setRequest((await getDeviceScreenshotRequest(device.deviceId)).data); setError(""); }
    catch (failure) { setError(failure.message); }
  }, [device.deviceId]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (request?.status !== "pending") return;
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
  }, [refresh, request?.status]);
  async function send() {
    setBusy(true); setError("");
    try { setRequest((await requestDeviceScreenshot(device.deviceId)).data); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const labels = { pending: "Waiting for the phone and screen-sharing approval. Expires after five minutes.", captured: "Screenshot uploaded. Open the employee's activity view to see it.", declined: "The employee declined this request.", failed: "The phone could not complete this capture.", expired: "Request expired without a screenshot." };
  return <div className="max-w-xs space-y-2">
    <button type="button" className="btn-secondary" disabled={!enabled || device.status !== "active" || busy || request?.status === "pending"} onClick={send}><Camera className="h-4 w-4" />{busy ? "Requesting…" : "Request screenshot"}</button>
    <p className="text-xs text-slate-500" role="status">{error || labels[request?.status] || "Requires active tracking and Android screen-sharing approval."}</p>
  </div>;
}
