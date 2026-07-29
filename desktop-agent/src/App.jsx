import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createFieldFlowAuth, verifyEmployeeAccess } from "./lib/auth";
import { createActivityApi } from "./lib/api";
import { captureSample } from "./lib/sampler";
import { policyAcknowledgementText, sha256Hex } from "./lib/policy";
import { deriveAgentStatus, formatDuration } from "./lib/status";
import { syncPendingSamples } from "./lib/sync";
import { AGENT_VERSION, readConfiguration } from "./config";

const config = readConfiguration();

function agentLog(event, level = "info") {
  return invoke("agent_log", { event, level, debugEnabled: config.debug }).catch(() => {});
}

function Login({ supabase, onSignedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      await onSignedIn();
      setPassword("");
    } catch (submitError) {
      await supabase.auth.signOut().catch(() => {});
      setPassword("");
      setError(submitError.message || "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="card auth-card">
        <div className="brand-mark" aria-hidden="true">⚡</div>
        <p className="eyebrow">FIELD-FLOW</p>
        <h1>Activity Agent</h1>
        <p className="muted">Sign in with your existing approved employee account.</p>
        <form onSubmit={submit}>
          <label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="privacy-note">Your session tokens are stored in Windows Credential Manager, never in SQLite or browser local storage.</p>
      </section>
    </main>
  );
}

function PolicyConsent({ policy, onAccept, onSignOut }) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const text = policyAcknowledgementText(policy);

  async function accept() {
    setBusy(true);
    try {
      await onAccept(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="card consent-card">
        <p className="eyebrow">MONITORING POLICY</p>
        <h1>Your consent is required</h1>
        <p>{text}</p>
        <div className="notice">
          <strong>Never collected:</strong> typed text, key names or codes, screenshots, clipboard content,
          window titles, document names, full executable paths, mouse coordinates, or usernames.
        </div>
        <label className="check">
          <input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />
          I understand and acknowledge policy version {policy.policyVersion}.
        </label>
        <div className="actions">
          <button className="secondary" onClick={onSignOut}>Sign out</button>
          <button disabled={!accepted || busy} onClick={accept}>{busy ? "Saving…" : "Accept policy"}</button>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const supabase = useMemo(() => config.valid ? createFieldFlowAuth(config) : null, []);
  const api = useMemo(() => supabase ? createActivityApi({ baseUrl: config.fieldFlowUrl, supabase }) : null, [supabase]);
  const [account, setAccount] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [device, setDevice] = useState(null);
  const [session, setSession] = useState(null);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [queueCount, setQueueCount] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [lastSync, setLastSync] = useState(null);
  const [lastSample, setLastSample] = useState(null);
  const [lastHeartbeat, setLastHeartbeat] = useState(null);
  const [currentApplication, setCurrentApplication] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const timers = useRef([]);
  const sampling = useRef(false);
  const syncing = useRef(false);
  const trackingSessionId = useRef(null);

  const clearTimers = useCallback(() => {
    timers.current.forEach(window.clearInterval);
    timers.current = [];
  }, []);

  const refreshQueue = useCallback(async () => {
    const count = await invoke("pending_sample_count");
    setQueueCount(count);
  }, []);

  const register = useCallback(async () => {
    const system = await invoke("get_device_identity");
    const [existingDeviceId, registeredAt] = await Promise.all([
      invoke("get_agent_state", { key: "device_id" }),
      invoke("get_agent_state", { key: "device_registered_at" })
    ]);
    if (existingDeviceId) {
      const existing = {
        deviceId: existingDeviceId,
        deviceName: system.deviceName,
        operatingSystemVersion: system.operatingSystemVersion,
        agentVersion: AGENT_VERSION,
        status: "active",
        registeredAt
      };
      setDevice(existing);
      return existing;
    }
    const result = await api.registerDevice({
      deviceName: system.deviceName,
      platform: "windows",
      operatingSystemVersion: system.operatingSystemVersion,
      agentVersion: AGENT_VERSION,
      deviceIdentifier: system.stableIdentifier
    });
    await invoke("set_agent_state", { key: "device_id", value: result.deviceId });
    await invoke("set_agent_state", {
      key: "device_registered_at",
      value: result.registeredAt || new Date().toISOString()
    });
    await agentLog("device_registered");
    setDevice(result);
    return result;
  }, [api]);

  const initialize = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const currentAccount = await verifyEmployeeAccess(supabase);
      setAccount(currentAccount);
      const [currentPolicy, currentSession] = await Promise.all([
        api.getPolicy(),
        api.getCurrentSession()
      ]);
      setPolicy(currentPolicy);
      const [wasTracking, savedSessionId] = await Promise.all([
        invoke("get_agent_state", { key: "tracking_active" }),
        invoke("get_agent_state", { key: "tracking_session_id" })
      ]);
      const resumable = currentSession.active
        && wasTracking === "true"
        && savedSessionId === currentSession.session.sessionId;
      trackingSessionId.current = resumable ? currentSession.session.sessionId : null;
      setSession(resumable ? currentSession.session : null);
      if (currentSession.active && !resumable) {
        setError("An active server session exists without matching local resume state. Stop it from My Activity before starting a new session.");
      }
      const registeredDevice = await register();
      await invoke("recover_uploading_samples");
      await refreshQueue();
      await api.heartbeat({
        deviceId: registeredDevice.deviceId,
        trackingSessionId: resumable ? currentSession.session.sessionId : null,
        agentVersion: AGENT_VERSION,
        onlineStatus: "online",
        batteryLevel: null
      });
      setLastHeartbeat(new Date());
      await agentLog("login_succeeded");
    } catch (initializationError) {
      await agentLog("login_failed", "warn");
      setError(initializationError.message || "The agent could not initialize.");
      const { data } = await supabase.auth.getSession();
      if (!data.session) setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [api, refreshQueue, register, supabase]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) initialize();
      else setLoading(false);
    });
    return clearTimers;
  }, [clearTimers, initialize, supabase]);

  useEffect(() => {
    const resumeHeartbeat = async () => {
      if (!account || !device) return;
      await api.heartbeat({
        deviceId: device.deviceId,
        trackingSessionId: session?.sessionId || null,
        agentVersion: AGENT_VERSION,
        onlineStatus: "online",
        batteryLevel: null
      }).then(() => setLastHeartbeat(new Date()))
        .catch(heartbeatError => setError(`Heartbeat delayed: ${heartbeatError.message}`));
    };
    const onlineHandler = () => {
      setOnline(true);
      resumeHeartbeat();
    };
    const offlineHandler = () => setOnline(false);
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") resumeHeartbeat();
    };
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    document.addEventListener("visibilitychange", visibilityHandler);
    const unlisteners = Promise.all([
      listen("agent-start-requested", () => { if (!session) document.getElementById("start-button")?.click(); }),
      listen("agent-stop-requested", () => { if (session) document.getElementById("stop-button")?.click(); }),
      listen("agent-sync-requested", () => { document.getElementById("sync-button")?.click(); }),
      listen("agent-sign-out-requested", () => { document.getElementById("sign-out-button")?.click(); }),
      listen("agent-quit-requested", async () => {
        if (window.confirm(session ? "Stop tracking and quit FieldFlow Activity Agent?" : "Quit FieldFlow Activity Agent?")) {
          if (session) await stopTracking();
          await invoke("quit_agent");
        }
      })
    ]);
    return () => {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
      document.removeEventListener("visibilitychange", visibilityHandler);
      unlisteners.then(items => items.forEach(unlisten => unlisten()));
    };
  });

  const performSync = useCallback(async () => {
    if (!online || !device || !session || syncing.current) return;
    syncing.current = true;
    try {
      await syncPendingSamples(api, device.deviceId, session.sessionId);
      setLastSync(new Date());
      await agentLog("sync_succeeded");
      await refreshQueue();
    } catch (syncError) {
      setError(`Sync paused: ${syncError.message}`);
      await agentLog("sync_delayed", "warn");
    } finally {
      syncing.current = false;
    }
  }, [api, device, online, refreshQueue, session]);

  useEffect(() => {
    clearTimers();
    if (!account || !policy || !device) return undefined;
    timers.current.push(window.setInterval(() => setNow(Date.now()), 1000));
    timers.current.push(window.setInterval(async () => {
      const idle = await invoke("get_idle_seconds").catch(() => 0);
      setIdleSeconds(idle);
    }, 5000));
    timers.current.push(window.setInterval(async () => {
      const heartbeatIdleSeconds = await invoke("get_idle_seconds").catch(() => 0);
      await api.heartbeat({
        deviceId: device.deviceId,
        trackingSessionId: session?.sessionId || null,
        agentVersion: AGENT_VERSION,
        onlineStatus: deriveAgentStatus({
          online,
          session,
          idleSeconds: heartbeatIdleSeconds,
          idleThresholdSeconds: policy.idleThresholdSeconds
        }) === "Idle" ? "idle" : online ? "online" : "offline",
        batteryLevel: null
      }).then(() => setLastHeartbeat(new Date()))
        .catch(heartbeatError => setError(`Heartbeat delayed: ${heartbeatError.message}`));
    }, Math.max(15, policy.heartbeatIntervalSeconds || 60) * 1000));
    if (session && policy.trackingEnabled) {
      timers.current.push(window.setInterval(async () => {
        if (sampling.current) return;
        sampling.current = true;
        try {
          const sample = await captureSample({
            sessionId: session.sessionId,
            collectApplicationNames: policy.collectApplicationNames
          }, undefined, () => trackingSessionId.current === session.sessionId);
          if (!sample) return;
          setLastSample(new Date(sample.capturedAt));
          setCurrentApplication(sample.activeApplication);
          await refreshQueue();
        } catch (sampleError) {
          setError(`Sampling paused: ${sampleError.message}`);
        } finally {
          sampling.current = false;
        }
      }, Math.max(10, policy.sampleIntervalSeconds || 60) * 1000));
      timers.current.push(window.setInterval(performSync, Math.max(30, policy.uploadIntervalSeconds || 300) * 1000));
    }
    return clearTimers;
  }, [account, api, clearTimers, device, online, performSync, policy, refreshQueue, session]);

  async function acknowledge(text) {
    await api.acknowledgePolicy({
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      acknowledgementTextHash: await sha256Hex(text)
    });
    setPolicy(await api.getPolicy());
  }

  async function startTracking() {
    if (!device || !policy?.trackingEnabled) return;
    setError("");
    try {
      const started = await api.startSession({ deviceId: device.deviceId, projectId: null, taskId: null, source: "agent" });
      await invoke("set_agent_state", { key: "tracking_active", value: "true" });
      await invoke("set_agent_state", { key: "tracking_session_id", value: started.sessionId });
      trackingSessionId.current = started.sessionId;
      setSession(started);
      await api.heartbeat({
        deviceId: device.deviceId,
        trackingSessionId: started.sessionId,
        agentVersion: AGENT_VERSION,
        onlineStatus: "online",
        batteryLevel: null
      });
      setLastHeartbeat(new Date());
      await agentLog("tracking_started");
    } catch (startError) {
      if (startError.code === "DEVICE_REVOKED" || startError.code === "DEVICE_NOT_ACTIVE") {
        setDevice(current => ({ ...current, status: startError.code === "DEVICE_REVOKED" ? "revoked" : "pending" }));
      }
      setError(startError.message);
    }
  }

  async function stopTracking() {
    if (!session) return;
    trackingSessionId.current = null;
    setError("");
    try {
      await performSync();
      await api.stopSession({ sessionId: session.sessionId, source: "agent" });
      await invoke("set_agent_state", { key: "tracking_active", value: "false" });
      await invoke("set_agent_state", { key: "tracking_session_id", value: "" });
      setSession(null);
      sampling.current = false;
      await api.heartbeat({
        deviceId: device.deviceId,
        trackingSessionId: null,
        agentVersion: AGENT_VERSION,
        onlineStatus: "online",
        batteryLevel: null
      });
      setLastHeartbeat(new Date());
      await agentLog("tracking_stopped");
    } catch (stopError) {
      setError(stopError.message);
    }
  }

  async function signOut() {
    if (session) {
      setError("Stop tracking before signing out.");
      return;
    }
    clearTimers();
    await supabase.auth.signOut();
    await agentLog("logout_succeeded");
    setAccount(null);
    setPolicy(null);
    setDevice(null);
  }

  if (!config.valid) {
    return <main className="auth-shell"><section className="card"><h1>Configuration required</h1><p>Add these values to <code>.env.local</code>:</p><pre>{config.missing.join("\n")}</pre></section></main>;
  }
  if (loading) return <main className="auth-shell"><p>Starting FieldFlow Activity Agent…</p></main>;
  if (!account) return <Login supabase={supabase} onSignedIn={initialize} />;
  if (policy?.requireAcknowledgement && !policy.acknowledgementStatus?.acknowledged) {
    return <PolicyConsent policy={policy} onAccept={acknowledge} onSignOut={signOut} />;
  }

  const status = deriveAgentStatus({
    online,
    session,
    idleSeconds,
    idleThresholdSeconds: policy?.idleThresholdSeconds
  });
  const duration = session ? Math.floor((now - new Date(session.startedAt).getTime()) / 1000) : 0;

  return (
    <main className="app-shell">
      <header>
        <div><p className="eyebrow">FIELD-FLOW</p><h1>Activity Agent</h1></div>
        <button id="sign-out-button" className="link-button" onClick={signOut}>Sign out</button>
      </header>
      <section className="status-hero card">
        <div><span className={`status-dot ${status.toLowerCase().replace(" ", "-")}`} /><strong>{status}</strong></div>
        <p>{account.profile.full_name}</p>
        <p className="muted">{device?.deviceName || "Registering this device…"}</p>
        {session
          ? <button id="stop-button" className="danger" onClick={stopTracking}>Stop tracking</button>
          : <button id="start-button" onClick={startTracking} disabled={!policy?.trackingEnabled}>Start tracking</button>}
        <button id="sync-button" className="secondary sync-button" onClick={performSync} disabled={!session || !online}>Sync now</button>
        {!policy?.trackingEnabled && <p className="warning">Activity tracking is currently disabled by your administrator.</p>}
      </section>
      <section className="grid">
        <article className="card metric"><span>Session duration</span><strong>{formatDuration(duration)}</strong></article>
        <article className="card metric"><span>Idle time</span><strong>{formatDuration(idleSeconds)}</strong></article>
        <article className="card metric"><span>Pending samples</span><strong>{queueCount}</strong></article>
        <article className="card metric"><span>Last sync</span><strong>{lastSync ? lastSync.toLocaleTimeString() : "Not yet"}</strong></article>
        <article className="card metric"><span>Last sample</span><strong>{lastSample ? lastSample.toLocaleTimeString() : "Not yet"}</strong></article>
        <article className="card metric"><span>Last heartbeat</span><strong>{lastHeartbeat ? lastHeartbeat.toLocaleTimeString() : "Not yet"}</strong></article>
        <article className="card metric"><span>Application</span><strong>{policy?.collectApplicationNames ? currentApplication || "Unavailable" : "Disabled"}</strong></article>
        <article className="card metric"><span>Agent version</span><strong>{AGENT_VERSION}</strong></article>
        <article className="card metric"><span>Device status</span><strong>{device?.status || "Unknown"}</strong></article>
        <article className="card metric"><span>Platform</span><strong>{device?.operatingSystemVersion || "Windows"}</strong></article>
        <article className="card metric"><span>Registered</span><strong>{device?.registeredAt ? new Date(device.registeredAt).toLocaleString() : "Pending"}</strong></article>
      </section>
      {error && <p className="error banner" role="alert">{error}</p>}
      <section className="card privacy">
        <h2>Privacy by design</h2>
        <p>This agent records idle duration, screen-lock state, optional application executable name, and safe aggregate input counts. On this build, keyboard and mouse counts remain zero because no content-exposing hooks are installed.</p>
      </section>
      {policy && <section className="card privacy">
        <h2>Monitoring policy v{policy.policyVersion}</h2>
        <p>Sample every {policy.sampleIntervalSeconds}s · Upload every {policy.uploadIntervalSeconds}s · Heartbeat every {policy.heartbeatIntervalSeconds}s · Idle after {policy.idleThresholdSeconds}s · Offline sync limit {formatDuration(policy.offlineSyncLimitSeconds)} · Retention {policy.retentionDays} days · Application names {policy.collectApplicationNames ? "enabled" : "disabled"} · Acknowledgement {policy.requireAcknowledgement ? "required" : "not required"}</p>
      </section>}
    </main>
  );
}
