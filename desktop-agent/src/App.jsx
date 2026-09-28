import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { enable as enableAutostart } from "@tauri-apps/plugin-autostart";
import { clearFieldFlowSession, createFieldFlowAuth, verifyEmployeeAccess } from "./lib/auth";
import { createActivityApi } from "./lib/api";
import { createSessionManager } from "./lib/sessionManager";
import { isApplicationApproved } from "./lib/applicationAccess";
import { captureCodingSample, captureSample } from "./lib/sampler";
import { isHeartbeatRateLimit, shouldSendHeartbeat } from "./lib/heartbeat";
import { decideStartupTracking, isSameMonitoringPolicy, reconcileTrackingSession } from "./lib/lifecycle";
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

function Login({ supabase, onSignedIn, notice = "" }) {
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
          {(error || notice) && <p className="error" role="alert">{error || notice}</p>}
          <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="privacy-note">Your session tokens are stored in Windows Credential Manager, never in SQLite or browser local storage.</p>
      </section>
    </main>
  );
}

function PolicyConsent({ policy, onAccept, onSignOut, allowSignOut = true }) {
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
          <strong>Never collected:</strong> typed text, key names or codes, clipboard content,
          window titles, document names, full executable paths, mouse coordinates, or usernames.
        </div>
        {policy.collectScreenshots && (
          <div className="notice">
            <strong>Screenshot capture is enabled</strong> by your organisation: roughly every {policy.screenshotIntervalSeconds} seconds
            during an active session, excluding a configured list of applications.
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />
          I understand and acknowledge policy version {policy.policyVersion}.
        </label>
        <div className="actions">
          {allowSignOut && <button className="secondary" onClick={onSignOut}>Sign out</button>}
          <button disabled={!accepted || busy} onClick={accept}>{busy ? "Saving…" : "Accept policy"}</button>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const supabase = useMemo(() => config.valid ? createFieldFlowAuth(config) : null, []);
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
  const [screenshotCaptureEnabled, setScreenshotCaptureEnabled] = useState(false);
  const [webAccessPolicy, setWebAccessPolicy] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(
    config.updatesEnabled ? "Waiting for automatic check" : "Not configured"
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const handleAuthEvent = useCallback(async (event, level = "info") => {
    await agentLog(event, level);
    if (event === "auth_refresh_rejected_retained") {
      setError("FieldFlow could not refresh the saved session. Your login has been retained and the agent will retry automatically.");
    }
  }, []);
  const sessionManager = useMemo(() => supabase
    ? createSessionManager({ supabase, onEvent: handleAuthEvent })
    : null, [handleAuthEvent, supabase]);
  const api = useMemo(() => supabase && sessionManager
    ? createActivityApi({ baseUrl: config.fieldFlowUrl, supabase, sessionManager })
    : null, [sessionManager, supabase]);
  const deviceId = device?.deviceId;
  const corporateMode = device ? device.agentMode === "corporate" : config.agentMode === "corporate";
  const employeeSignOutAllowed = !corporateMode && device?.employeeSignOutAllowed !== false;
  const employeeQuitAllowed = !corporateMode && device?.employeeQuitAllowed !== false;
  const timers = useRef([]);
  const sampling = useRef(false);
  const screenshotting = useRef(false);
  const syncing = useRef(false);
  const trackingSessionId = useRef(null);
  const previousOnline = useRef(navigator.onLine);
  const reconciling = useRef(false);
  const updating = useRef(false);
  const heartbeatInFlight = useRef(false);
  const lastHeartbeatAttemptAt = useRef(0);
  const trackingDesired = useRef(true);
  const recoveryInFlight = useRef(false);
  const recoveryRetryAttempt = useRef(0);
  const recoveryRetryTimer = useRef(null);
  const recoverAfterSystemActivityRef = useRef(null);

  const clearTimers = useCallback(() => {
    timers.current.forEach(window.clearInterval);
    timers.current = [];
  }, []);

  const applyWebAccessPolicy = useCallback(async effectiveWebPolicy => {
    const policyValue = effectiveWebPolicy || {
      enabled: false,
      blockedDomains: [],
      blockedApplications: [],
      activeOverrides: [],
      requireManagedExtension: false
    };
    setWebAccessPolicy(policyValue);
    await invoke("set_agent_state", {
      key: "blocklist_json",
      value: JSON.stringify({
        blockedDomains: policyValue.enabled ? (policyValue.blockedDomains || []) : [],
        overrides: (policyValue.activeOverrides || [])
          .filter(item => item.resourceType === "domain")
          .map(item => ({ domain: item.resourceKey, overrideEndsAt: item.accessEndsAt || null }))
      })
    }).catch(() => null);
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
      const integrity = await invoke("get_agent_integrity").catch(() => null);
      const result = await api.heartbeat({
        deviceId: targetDeviceId,
        trackingSessionId: targetSessionId || null,
        agentVersion: AGENT_VERSION,
        onlineStatus,
        batteryLevel: null,
        integrity
      });
      setDevice(current => current ? {
        ...current,
        status: result.deviceStatus,
        agentMode: result.agentManagement?.mode || current.agentMode || "standard",
        employeeSignOutAllowed: result.agentManagement?.employeeSignOutAllowed !== false,
        employeeQuitAllowed: result.agentManagement?.employeeQuitAllowed !== false,
        autoStartTracking: Boolean(result.agentManagement?.autoStartTracking),
        recoveryEnabled: result.agentManagement?.recoveryEnabled !== false,
        managedAt: result.agentManagement?.managedAt || current.managedAt || null
      } : current);
      if (result.agentManagement?.autoStartTracking) {
        trackingDesired.current = true;
        await invoke("set_agent_state", { key: "tracking_desired", value: "true" }).catch(() => null);
      }
      setLastHeartbeat(new Date());
      setScreenshotCaptureEnabled(Boolean(result.collectScreenshots));
      const effectiveWebPolicy = result.webAccessPolicy?.ruleId
        ? result.webAccessPolicy
        : {
            enabled: Boolean(result.websiteBlockingEnabled),
            blockedDomains: result.blockedDomains || [],
            blockedApplications: [],
            activeOverrides: (result.activeOverrides || []).map(item => ({ resourceType: "domain", resourceKey: item.domain, accessEndsAt: item.overrideEndsAt })),
            requireManagedExtension: false
          };
      await applyWebAccessPolicy(effectiveWebPolicy);
      setError(current => current.startsWith("Heartbeat delayed:") ? "" : current);
      await invoke("set_agent_state", {
        key: "screenshot_excluded_apps_json",
        value: JSON.stringify(result.collectScreenshots ? (result.screenshotExcludedApps || []) : [])
      }).catch(() => null);
      if (effectiveWebPolicy.enabled && effectiveWebPolicy.requireManagedExtension) {
        const rawExtensionHealth = await invoke("get_agent_state", { key: "browser_extension_heartbeat_json" }).catch(() => null);
        let extensionHealth = null;
        try { extensionHealth = rawExtensionHealth ? JSON.parse(rawExtensionHealth) : null; } catch { extensionHealth = null; }
        const lastSeen = extensionHealth?.lastSeenAt ? new Date(extensionHealth.lastSeenAt).getTime() : 0;
        const stale = !lastSeen || Date.now() - lastSeen > 5 * 60 * 1000;
        await api.reportExtensionHealth({
          deviceId: targetDeviceId,
          browserName: extensionHealth?.browserName || "managed-browser",
          extensionId: extensionHealth?.extensionId || "",
          extensionVersion: extensionHealth?.extensionVersion || "",
          status: stale ? "missing" : "installed",
          lastSeenAt: extensionHealth?.lastSeenAt || null
        }).catch(() => null);
      }
      const pendingEvent = await invoke("get_agent_state", { key: "pending_web_access_event_json" }).catch(() => null);
      if (pendingEvent) {
        try {
          const event = JSON.parse(pendingEvent);
          await api.recordWebAccessEvent({ ...event, deviceId: targetDeviceId });
          await invoke("set_agent_state", { key: "pending_web_access_event_json", value: "" });
        } catch {
          // Keep the event queued for a later heartbeat.
        }
      }
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
  }, [api, applyWebAccessPolicy]);

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
      const currentAccount = await verifyEmployeeAccess(supabase, sessionManager);
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
      const desiredState = await invoke("get_agent_state", { key: "tracking_desired" });
      trackingDesired.current = authoritativeDevice.autoStartTracking || desiredState !== "false";

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
        deviceId: registeredDevice.deviceId,
        trackingDesired: trackingDesired.current
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
      if (initializationError?.code === "AUTH_SESSION_MISSING") setAccount(null);
      return false;
    } finally {
      setLoading(false);
    }
  }, [api, refreshQueue, register, sendHeartbeat, sessionManager, supabase]);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    const repairStartup = async () => {
      try {
        // Re-register on every packaged launch. A key can exist but still point at an old,
        // uninstalled, or development executable; enable() overwrites it with this binary.
        await enableAutostart();
        await agentLog("autostart_enabled");
      } catch {
        await agentLog("autostart_enable_failed", "warn");
      }
      try {
        await invoke("ensure_recovery_task");
        await agentLog("recovery_task_enabled");
      } catch {
        await agentLog("recovery_task_enable_failed", "warn");
      }
    };
    repairStartup();
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    let retryTimer;
    const attemptStartup = async (attempt = 0) => {
      try {
        await sessionManager.getValidSession();
      } catch (sessionError) {
        if (cancelled) return;
        if (!sessionError.retryable) {
          setLoading(false);
          return;
        }
        const delay = Math.min(60_000, 5_000 * 2 ** attempt);
        await agentLog("startup_retry_scheduled", "warn");
        retryTimer = window.setTimeout(() => attemptStartup(attempt + 1), delay);
        return;
      }
      if (cancelled) return;
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
  }, [clearTimers, initialize, sessionManager, supabase]);

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
      recoverAfterSystemActivityRef.current?.();
    };
    const offlineHandler = () => setOnline(false);
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") resumeHeartbeat();
    };
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    document.addEventListener("visibilitychange", visibilityHandler);
    const unlisteners = Promise.all([
      listen("agent-start-requested", () => { if (!corporateMode && !session) document.getElementById("start-button")?.click(); }),
      listen("agent-stop-requested", () => { if (!corporateMode && session) document.getElementById("stop-button")?.click(); }),
      listen("agent-sync-requested", () => { document.getElementById("sync-button")?.click(); }),
      listen("agent-sign-out-requested", () => {
        if (employeeSignOutAllowed) document.getElementById("sign-out-button")?.click();
        else {
          setError("This company-managed device can only be signed out by an administrator.");
          if (corporateMode) reportAgentEvent("signout_blocked", { source: "tray_menu" });
        }
      }),
      listen("agent-quit-requested", async () => {
        if (!employeeQuitAllowed) {
          setError("Corporate Agent recovery is managed by your administrator and cannot be quit locally.");
          if (corporateMode) reportAgentEvent("quit_blocked", { source: "tray_menu" });
          return;
        }
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
    if ((!online && !navigator.onLine) || !deviceId || syncing.current) return;
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

  const reconcileWithServer = useCallback(async (policyOverride = null) => {
    if (!account || !deviceId || (!online && !navigator.onLine) || reconciling.current) return;
    reconciling.current = true;
    try {
      const currentSession = await api.getCurrentSession();
      const effectivePolicy = policyOverride || policy;
      const resolution = reconcileTrackingSession({
        localSession: trackingSessionId.current
          ? { sessionId: trackingSessionId.current }
          : null,
        currentSession,
        deviceId,
        policy: effectivePolicy,
        deviceStatus: device?.status,
        trackingDesired: trackingDesired.current
      });
      if (resolution.action === "stop") {
        if (currentSession?.active && currentSession.session?.deviceId === deviceId) {
          await api.stopSession({ sessionId: currentSession.session.sessionId, source: "agent" }).catch(() => null);
        }
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
      } else if (resolution.action === "start") {
        let started;
        try {
          started = await api.startSession({ deviceId, projectId: null, taskId: null, source: "agent" });
        } catch (startError) {
          if (startError.code !== "ACTIVE_SESSION_EXISTS") throw startError;
          const latest = await api.getCurrentSession();
          if (!latest.active || latest.session?.deviceId !== deviceId) throw startError;
          started = latest.session;
        }
        await invoke("set_agent_state", { key: "tracking_active", value: "true" });
        await invoke("set_agent_state", { key: "tracking_session_id", value: started.sessionId });
        trackingSessionId.current = started.sessionId;
        setSession(started);
        setError("");
        await invoke("set_input_collection_enabled", { enabled: true }).catch(inputError => {
          setError(`Input activity counting unavailable: ${inputError}`);
        });
        await agentLog("tracking_reconciled_started");
      }
    } catch (reconcileError) {
      setError(`Session check delayed: ${reconcileError.message}`);
      await agentLog("session_reconciliation_delayed", "warn");
    } finally {
      reconciling.current = false;
    }
  }, [account, api, device, deviceId, online, policy]);

  const recoverAfterSystemActivity = useCallback(async () => {
    if (recoveryInFlight.current) return;
    recoveryInFlight.current = true;
    await agentLog("system_recovery_started");
    try {
      const connected = navigator.onLine;
      setOnline(connected);
      if (!connected) throw new Error("The network is not ready after system resume.");
      await sessionManager.getValidSession();
      if (!account || !deviceId) {
        await initialize();
      } else {
        const currentPolicy = await api.getPolicy();
        setPolicy(current => isSameMonitoringPolicy(current, currentPolicy) ? current : currentPolicy);
        await reconcileWithServer(currentPolicy);
        await sendHeartbeat({
          targetDeviceId: deviceId,
          targetSessionId: trackingSessionId.current,
          intervalSeconds: policy?.heartbeatIntervalSeconds || 60,
          force: true
        });
        await performSync();
      }
      recoveryRetryAttempt.current = 0;
      window.clearTimeout(recoveryRetryTimer.current);
      recoveryRetryTimer.current = null;
      await agentLog("system_recovery_succeeded");
    } catch (recoveryError) {
      setError(`Recovery delayed: ${recoveryError?.message || "FieldFlow is temporarily unavailable."}`);
      await agentLog("system_recovery_delayed", "warn");
      if (recoveryError?.retryable !== false && recoveryError?.status !== 401) {
        const delay = Math.min(60_000, 5_000 * 2 ** recoveryRetryAttempt.current);
        recoveryRetryAttempt.current += 1;
        window.clearTimeout(recoveryRetryTimer.current);
        recoveryRetryTimer.current = window.setTimeout(
          () => recoverAfterSystemActivityRef.current?.(),
          delay
        );
      }
    } finally {
      recoveryInFlight.current = false;
    }
  }, [account, api, deviceId, initialize, performSync, policy, reconcileWithServer, sendHeartbeat, sessionManager]);

  useEffect(() => {
    recoverAfterSystemActivityRef.current = recoverAfterSystemActivity;
    return () => {
      recoverAfterSystemActivityRef.current = null;
      window.clearTimeout(recoveryRetryTimer.current);
    };
  }, [recoverAfterSystemActivity]);

  useEffect(() => {
    const unlisten = listen("agent-resume-requested", recoverAfterSystemActivity);
    return () => { unlisten.then(dispose => dispose()); };
  }, [recoverAfterSystemActivity]);

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
      const heartbeatResult = await sendHeartbeat({
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
      const currentPolicy = heartbeatResult?.monitoringPolicy || policy;
      if (heartbeatResult?.monitoringPolicy) {
        setPolicy(current => isSameMonitoringPolicy(current, currentPolicy) ? current : currentPolicy);
      }
      await reconcileWithServer(currentPolicy);
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
    if (session && policy.trackingEnabled && policy.collectScreenshots && screenshotCaptureEnabled) {
      timers.current.push(window.setInterval(async () => {
        if (screenshotting.current) return;
        screenshotting.current = true;
        try {
          const captured = await invoke("capture_screenshot", { sessionId: session.sessionId });
          if (captured && trackingSessionId.current === session.sessionId) await refreshQueue();
        } catch (screenshotError) {
          setError(`Screenshot capture paused: ${screenshotError}`);
        } finally {
          screenshotting.current = false;
        }
      }, Math.max(180, policy.screenshotIntervalSeconds || 240) * 1000));
    }
    return clearTimers;
  }, [account, api, clearTimers, deviceId, online, policy, reconcileWithServer, refreshQueue, screenshotCaptureEnabled, sendHeartbeat, session]);

  const uploadIntervalSeconds = policy?.uploadIntervalSeconds;

  useEffect(() => {
    if (!account || !deviceId) return undefined;
    const syncTimer = window.setInterval(
      performSync,
      Math.max(30, uploadIntervalSeconds || 300) * 1000
    );
    return () => window.clearInterval(syncTimer);
  }, [account, deviceId, performSync, uploadIntervalSeconds]);

  useEffect(() => {
    if (!account || !deviceId || !webAccessPolicy?.enabled) return undefined;
    const enforceApplications = async () => {
      const allowedApplications = (webAccessPolicy.activeOverrides || [])
        .filter(item => item.resourceType === "application" && (!item.accessEndsAt || new Date(item.accessEndsAt).getTime() > Date.now()))
        .map(item => item.resourceKey);
      const blockedApplications = (webAccessPolicy.blockedApplications || [])
        .filter(application => !isApplicationApproved(application, allowedApplications));
      if (!blockedApplications.length) return;
      try {
        const blocked = await invoke("enforce_restricted_applications", { blockedApplications });
        if (blocked) {
          setError(`${blocked} is restricted by your organisation. Request temporary access in My Activity.`);
          await api.recordWebAccessEvent({ deviceId, eventType: "application_blocked", resourceType: "application", resourceKey: blocked }).catch(() => null);
        }
      } catch (enforcementError) {
        await agentLog("native_application_enforcement_failed", "warn");
        setError(`Application restriction check failed: ${enforcementError}`);
      }
    };
    const applicationTimer = window.setInterval(enforceApplications, 2000);
    return () => window.clearInterval(applicationTimer);
  }, [account, api, deviceId, webAccessPolicy]);

  async function acknowledge(text) {
    await api.acknowledgePolicy({
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      acknowledgementTextHash: await sha256Hex(text)
    });
    await initialize();
  }

  async function signedIn() {
    trackingDesired.current = true;
    await invoke("set_agent_state", { key: "tracking_desired", value: "true" });
    return initialize();
  }

  async function startTracking() {
    if (!device || !policy?.trackingEnabled) return;
    setError("");
    try {
      trackingDesired.current = true;
      await invoke("set_agent_state", { key: "tracking_desired", value: "true" });
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
      trackingDesired.current = false;
      await invoke("set_agent_state", { key: "tracking_desired", value: "false" });
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

  // Best-effort report of a locally blocked action or an observed removal so
  // monitors are alerted. Never blocks or breaks the UI if the report fails.
  const reportAgentEvent = useCallback(async (eventType, detail = {}) => {
    const targetDeviceId = device?.deviceId;
    if (!targetDeviceId) return;
    try {
      await api.reportAgentEvent({ deviceId: targetDeviceId, eventType, detail });
      await agentLog(`agent_event_reported_${eventType}`);
    } catch {
      await agentLog(`agent_event_report_failed_${eventType}`, "warn");
    }
  }, [api, device]);

  async function signOut() {
    if (!employeeSignOutAllowed) {
      setError("This company-managed device can only be signed out by an administrator.");
      if (corporateMode) await reportAgentEvent("signout_blocked", { source: "sign_out_button" });
      return;
    }
    if (session) {
      setError("Stop tracking before signing out.");
      return;
    }
    clearTimers();
    trackingDesired.current = false;
    await invoke("set_agent_state", { key: "tracking_desired", value: "false" });
    await clearFieldFlowSession(supabase);
    await agentLog("logout_succeeded");
    setAccount(null);
    setPolicy(null);
    setScreenshotCaptureEnabled(false);
    setDevice(null);
  }

  if (!config.valid) {
    return <main className="auth-shell"><section className="card"><h1>Configuration required</h1><p>Add these values to <code>.env.local</code>:</p><pre>{config.missing.join("\n")}</pre></section></main>;
  }
  if (loading) return <main className="auth-shell"><p>Starting FieldFlow Activity Agent…</p></main>;
  if (!account) return <Login supabase={supabase} onSignedIn={signedIn} notice={error} />;
  if (policy?.requireAcknowledgement && !policy.acknowledgementStatus?.acknowledged) {
    return <PolicyConsent policy={policy} onAccept={acknowledge} onSignOut={signOut} allowSignOut={employeeSignOutAllowed} />;
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
        {employeeSignOutAllowed
          ? <button id="sign-out-button" className="link-button" onClick={signOut}>Sign out</button>
          : <span className="managed-badge">Corporate Agent</span>}
      </header>
      <section className="status-hero card">
        <div><span className={`status-dot ${status.toLowerCase().replace(" ", "-")}`} /><strong>{status}</strong></div>
        <p>{account.profile.full_name}</p>
        <p className="muted">{device?.deviceName || "Registering this device…"}</p>
        {corporateMode
          ? <p className="managed-notice">Tracking and recovery are managed by your organisation.</p>
          : session
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
        <article className="card metric"><span>Agent mode</span><strong>{corporateMode ? "Corporate" : "Standard"}</strong></article>
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
