import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { enable as enableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import { createFieldFlowAuth, verifyEmployeeAccess } from "./lib/auth";
import { createActivityApi } from "./lib/api";
import { captureCodingSample, captureSample } from "./lib/sampler";
import { isHeartbeatRateLimit, shouldSendHeartbeat } from "./lib/heartbeat";
import { decideStartupTracking, reconcileTrackingSession } from "./lib/lifecycle";
import { policyAcknowledgementText, sha256Hex } from "./lib/policy";
import { deriveAgentStatus, formatDuration } from "./lib/status";
import { syncAllPending } from "./lib/sync";
import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_STARTUP_DELAY_MS,
  checkAndInstallAgentUpdate
} from "./lib/updater";
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
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
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
  const [updateStatus, setUpdateStatus] = useState(
    config.updatesEnabled ? "Waiting for automatic check" : "Not configured"
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const deviceId = device?.deviceId;
  const timers = useRef([]);
  const sampling = useRef(false);
  const syncing = useRef(false);
  const trackingSessionId = useRef(null);
  const previousOnline = useRef(navigator.onLine);
  const reconciling = useRef(false);
  const updating = useRef(false);
  const heartbeatInFlight = useRef(false);
  const lastHeartbeatAttemptAt = useRef(0);

  const clearTimers = useCallback(() => {
    timers.current.forEach(window.clearInterval);
    timers.current = [];
  }, []);

  const sendHeartbeat = useCallback(async ({
    targetDeviceId,
    targetSessionId = trackingSessionId.current,
    onlineStatus = "online",
    intervalSeconds = 60,
    force = false
  } = {}) => {
    if (!api || !targetDeviceId || !navigator.onLine || heartbeatInFlight.current) return null;
    const attemptAt = Date.now();
    if (!force && !shouldSendHeartbeat({
      lastAttemptAt: lastHeartbeatAttemptAt.current,
      now: attemptAt,
      intervalSeconds
    })) return null;

    heartbeatInFlight.current = true;
    lastHeartbeatAttemptAt.current = attemptAt;
    try {
      const result = await api.heartbeat({
        deviceId: targetDeviceId,
        trackingSessionId: targetSessionId || null,
        agentVersion: AGENT_VERSION,
        onlineStatus,
        batteryLevel: null
      });
      setDevice(current => {
        if (!current || current.status === result.deviceStatus) return current;
        return { ...current, status: result.deviceStatus };
      });
      setLastHeartbeat(new Date());
      setError(current => current.startsWith("Heartbeat delayed:") ? "" : current);
      await invoke("set_agent_state", {
        key: "blocklist_json",
        value: JSON.stringify({
          blockedDomains: result.websiteBlockingEnabled ? (result.blockedDomains || []) : [],
          overrides: result.activeOverrides || []
        })
      }).catch(() => null);
      return result;
    } catch (heartbeatError) {
      if (isHeartbeatRateLimit(heartbeatError)) {
        await agentLog("heartbeat_rate_limited", "warn");
        return null;
      }
      throw heartbeatError;
    } finally {
      heartbeatInFlight.current = false;
    }
  }, [api]);

  const refreshQueue = useCallback(async () => {
    const count = await invoke("pending_sample_count");
    setQueueCount(count);
  }, []);

  const register = useCallback(async () => {
    const system = await invoke("get_device_identity");
    const existingDeviceId = await invoke("get_agent_state", { key: "device_id" });
    if (existingDeviceId) {
      const result = await api.getDevices();
      const existing = result.devices?.find(item => item.deviceId === existingDeviceId);
      if (existing) {
        setDevice(existing);
        return existing;
      }
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
      const registeredDevice = await register();
      await invoke("recover_uploading_samples");
      await refreshQueue();
      try {
        await syncAllPending(api, registeredDevice.deviceId);
        setLastSync(new Date());
        await agentLog("startup_sync_succeeded");
        await refreshQueue();
      } catch {
        await agentLog("startup_sync_delayed", "warn");
      }
      const authoritativeDevice = registeredDevice;
      setDevice(authoritativeDevice);

      const saveLocalSession = async activeSession => {
        await invoke("set_agent_state", { key: "tracking_active", value: "true" });
        await invoke("set_agent_state", { key: "tracking_session_id", value: activeSession.sessionId });
        trackingSessionId.current = activeSession.sessionId;
        setSession(activeSession);
        await invoke("set_input_collection_enabled", { enabled: true }).catch(inputError => {
          setError(`Input activity counting unavailable: ${inputError}`);
        });
      };
      const clearLocalSession = async () => {
        trackingSessionId.current = null;
        setSession(null);
        await invoke("set_input_collection_enabled", { enabled: false });
        await invoke("set_agent_state", { key: "tracking_active", value: "false" });
        await invoke("set_agent_state", { key: "tracking_session_id", value: "" });
      };

      const startupAction = decideStartupTracking({
        policy: currentPolicy,
        deviceStatus: authoritativeDevice.status,
        currentSession,
        deviceId: registeredDevice.deviceId
      });
      if (startupAction === "resume") {
        await saveLocalSession(currentSession.session);
        await agentLog("tracking_resumed");
      } else if (startupAction === "start") {
        let started;
        try {
          started = await api.startSession({
            deviceId: registeredDevice.deviceId,
            projectId: null,
            taskId: null,
            source: "agent"
          });
        } catch (startError) {
          if (startError.code !== "ACTIVE_SESSION_EXISTS") throw startError;
          const latest = await api.getCurrentSession();
          if (!latest.active || latest.session?.deviceId !== registeredDevice.deviceId) throw startError;
          started = latest.session;
        }
        await saveLocalSession(started);
        await agentLog("tracking_started_automatically");
      } else {
        await clearLocalSession();
        if (startupAction === "other-device") {
          setError("Tracking is already active on another registered device for this employee.");
        }
      }
      await sendHeartbeat({
        targetDeviceId: registeredDevice.deviceId,
        targetSessionId: trackingSessionId.current,
        intervalSeconds: currentPolicy.heartbeatIntervalSeconds,
        force: true
      });
      const updateResumeRequested = await invoke("get_agent_state", { key: "update_resume_requested" });
      if (updateResumeRequested === "true") {
        await invoke("set_agent_state", { key: "update_resume_requested", value: "false" });
        await agentLog("update_restart_recovered");
      }
      await agentLog("login_succeeded");
      return true;
    } catch (initializationError) {
      await agentLog("login_failed", "warn");
      setError(initializationError.message || "The agent could not initialize.");
      const { data } = await supabase.auth.getSession();
      if (!data.session) setAccount(null);
      return false;
    } finally {
      setLoading(false);
    }
  }, [api, refreshQueue, register, sendHeartbeat, supabase]);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    isAutostartEnabled()
      .then(enabled => enabled ? undefined : enableAutostart())
      .then(() => agentLog("autostart_enabled"))
      .catch(() => agentLog("autostart_enable_failed", "warn"));
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    let retryTimer;
    const attemptStartup = async (attempt = 0) => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        setLoading(false);
        return;
      }
      const succeeded = await initialize();
      if (cancelled || succeeded) return;
      const delay = Math.min(60_000, 5_000 * 2 ** attempt);
      await agentLog("startup_retry_scheduled", "warn");
      retryTimer = window.setTimeout(() => attemptStartup(attempt + 1), delay);
    };
    attemptStartup();
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      clearTimers();
    };
  }, [clearTimers, initialize, supabase]);

  useEffect(() => {
    const resumeHeartbeat = async () => {
      if (!account || !deviceId) return;
      await sendHeartbeat({
        targetDeviceId: deviceId,
        targetSessionId: session?.sessionId || null,
        intervalSeconds: policy?.heartbeatIntervalSeconds || 60
      })
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
    if (!online || !deviceId || syncing.current) return;
    syncing.current = true;
    try {
      await syncAllPending(api, deviceId);
      setLastSync(new Date());
      await agentLog("sync_succeeded");
      await refreshQueue();
    } catch (syncError) {
      setError(`Sync paused: ${syncError.message}`);
      await agentLog("sync_delayed", "warn");
    } finally {
      syncing.current = false;
    }
  }, [api, deviceId, online, refreshQueue]);

  const checkForUpdates = useCallback(async () => {
    if (import.meta.env.DEV || !config.updatesEnabled || !online || updating.current) return;
    updating.current = true;
    try {
      const result = await checkAndInstallAgentUpdate({
        beforeInstall: async () => {
          if (deviceId) await performSync();
          await invoke("set_agent_state", { key: "update_resume_requested", value: "true" });
          await agentLog("update_installing");
        },
        onStatus: setUpdateStatus
      });
      if (!result.installed) await agentLog("update_check_current");
    } catch {
      setUpdateStatus("Automatic check delayed");
      await agentLog("update_check_delayed", "warn");
    } finally {
      updating.current = false;
    }
  }, [deviceId, online, performSync]);

  useEffect(() => {
    if (import.meta.env.DEV || !config.updatesEnabled) return undefined;
    const startup = window.setTimeout(checkForUpdates, UPDATE_STARTUP_DELAY_MS);
    const interval = window.setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
    return () => {
      window.clearTimeout(startup);
      window.clearInterval(interval);
    };
  }, [checkForUpdates]);

  const reconcileWithServer = useCallback(async () => {
    if (!account || !deviceId || !online || reconciling.current) return;
    reconciling.current = true;
    try {
      const currentSession = await api.getCurrentSession();
      const resolution = reconcileTrackingSession({
        localSession: trackingSessionId.current
          ? { sessionId: trackingSessionId.current }
          : null,
        currentSession,
        deviceId
      });
      if (resolution.action === "stop") {
        trackingSessionId.current = null;
        setSession(null);
        sampling.current = false;
        await invoke("set_input_collection_enabled", { enabled: false });
        await invoke("set_agent_state", { key: "tracking_active", value: "false" });
        await invoke("set_agent_state", { key: "tracking_session_id", value: "" });
        setError("Tracking was stopped on FieldFlow. Local collection has stopped.");
        await agentLog("tracking_reconciled_stopped");
      } else if (resolution.action === "resume") {
        await invoke("set_agent_state", { key: "tracking_active", value: "true" });
        await invoke("set_agent_state", { key: "tracking_session_id", value: resolution.session.sessionId });
        trackingSessionId.current = resolution.session.sessionId;
        setSession(resolution.session);
        await invoke("set_input_collection_enabled", { enabled: true });
        setError("");
        await agentLog("tracking_reconciled_resumed");
      }
    } catch (reconcileError) {
      setError(`Session check delayed: ${reconcileError.message}`);
      await agentLog("session_reconciliation_delayed", "warn");
    } finally {
      reconciling.current = false;
    }
  }, [account, api, deviceId, online]);

  useEffect(() => {
    if (online && !previousOnline.current) {
      performSync();
      reconcileWithServer();
    }
    previousOnline.current = online;
  }, [online, performSync, reconcileWithServer]);

  useEffect(() => {
    clearTimers();
    if (!account || !policy || !deviceId) return undefined;
    timers.current.push(window.setInterval(() => setNow(Date.now()), 1000));
    timers.current.push(window.setInterval(async () => {
      const idle = await invoke("get_idle_seconds").catch(() => 0);
      setIdleSeconds(idle);
    }, 5000));
    timers.current.push(window.setInterval(async () => {
      const heartbeatIdleSeconds = await invoke("get_idle_seconds").catch(() => 0);
      await sendHeartbeat({
        targetDeviceId: deviceId,
        targetSessionId: session?.sessionId || null,
        intervalSeconds: policy.heartbeatIntervalSeconds,
        onlineStatus: deriveAgentStatus({
          online,
          session,
          idleSeconds: heartbeatIdleSeconds,
          idleThresholdSeconds: policy.idleThresholdSeconds
        }) === "Idle" ? "idle" : online ? "online" : "offline"
      })
        .catch(heartbeatError => setError(`Heartbeat delayed: ${heartbeatError.message}`));
      await reconcileWithServer();
    }, Math.max(15, policy.heartbeatIntervalSeconds || 60) * 1000));
    timers.current.push(window.setInterval(
      performSync,
      Math.max(30, policy.uploadIntervalSeconds || 300) * 1000
    ));
    if (session && policy.trackingEnabled) {
      timers.current.push(window.setInterval(async () => {
        if (sampling.current) return;
        sampling.current = true;
        try {
          const sample = await captureSample({
            sessionId: session.sessionId,
            collectApplicationNames: policy.collectApplicationNames
          }, undefined, () => trackingSessionId.current === session.sessionId);
          await captureCodingSample({
            sessionId: session.sessionId,
            collectCodingProjectNames: policy.collectCodingProjectNames
          }, undefined, () => trackingSessionId.current === session.sessionId).catch(() => null);
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
    }
    return clearTimers;
  }, [account, clearTimers, deviceId, online, performSync, policy, reconcileWithServer, refreshQueue, sendHeartbeat, session]);

  async function acknowledge(text) {
    await api.acknowledgePolicy({
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      acknowledgementTextHash: await sha256Hex(text)
    });
    await initialize();
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
      await invoke("set_input_collection_enabled", { enabled: true }).catch(inputError => {
        setError(`Input activity counting unavailable: ${inputError}`);
      });
      await sendHeartbeat({
        targetDeviceId: device.deviceId,
        targetSessionId: started.sessionId,
        intervalSeconds: policy.heartbeatIntervalSeconds
      });
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
    setError("");
    try {
      if (!sampling.current) {
        sampling.current = true;
        try {
          const finalSample = await captureSample({
            sessionId: session.sessionId,
            collectApplicationNames: policy.collectApplicationNames
          }, undefined, () => trackingSessionId.current === session.sessionId);
          if (finalSample) {
            setLastSample(new Date(finalSample.capturedAt));
            setCurrentApplication(finalSample.activeApplication);
            await refreshQueue();
          }
        } catch {
          await agentLog("final_sample_failed", "warn");
        } finally {
          sampling.current = false;
        }
      }
      await performSync();
      await api.stopSession({ sessionId: session.sessionId, source: "agent" });
      trackingSessionId.current = null;
      await invoke("set_input_collection_enabled", { enabled: false });
      await invoke("set_agent_state", { key: "tracking_active", value: "false" });
      await invoke("set_agent_state", { key: "tracking_session_id", value: "" });
      setSession(null);
      sampling.current = false;
      await sendHeartbeat({
        targetDeviceId: device.deviceId,
        targetSessionId: null,
        intervalSeconds: policy.heartbeatIntervalSeconds
      });
      await performSync();
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
    await supabase.auth.signOut({ scope: "local" });
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
        <button id="sync-button" className="secondary sync-button" onClick={performSync} disabled={!device || !online}>Sync now</button>
        {policy && !policy.trackingEnabled && <p className="warning">Activity tracking is currently disabled by your administrator.</p>}
        {!policy && <p className="warning">Unable to reach the FieldFlow service to load your monitoring policy. Check your connection.</p>}
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
        <article className="card metric"><span>Automatic updates</span><strong>{updateStatus}</strong></article>
        <article className="card metric"><span>Device status</span><strong>{device?.status || "Unknown"}</strong></article>
        <article className="card metric"><span>Platform</span><strong>{device?.operatingSystemVersion || "Windows"}</strong></article>
        <article className="card metric"><span>Registered</span><strong>{device?.registeredAt ? new Date(device.registeredAt).toLocaleString() : "Pending"}</strong></article>
      </section>
      {error && <p className="error banner" role="alert">{error}</p>}
      <section className="card privacy">
        <h2>Privacy by design</h2>
        <p>This agent records idle duration, screen-lock state, optional application executable name, and aggregate keyboard and mouse activity counts. It never records typed text, key identities, mouse coordinates, or click targets.</p>
      </section>
      {policy && <section className="card privacy">
        <h2>Monitoring policy v{policy.policyVersion}</h2>
        <p>Sample every {policy.sampleIntervalSeconds}s · Upload every {policy.uploadIntervalSeconds}s · Heartbeat every {policy.heartbeatIntervalSeconds}s · Idle after {policy.idleThresholdSeconds}s · Offline sync limit {formatDuration(policy.offlineSyncLimitSeconds)} · Retention {policy.retentionDays} days · Application names {policy.collectApplicationNames ? "enabled" : "disabled"} · Acknowledgement {policy.requireAcknowledgement ? "required" : "not required"}</p>
      </section>}
    </main>
  );
}
