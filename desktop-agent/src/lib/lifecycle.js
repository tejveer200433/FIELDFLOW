export function policyAllowsAutomaticTracking(policy) {
  if (!policy?.trackingEnabled) return false;
  return !policy.requireAcknowledgement || Boolean(policy.acknowledgementStatus?.acknowledged);
}

export function isSameMonitoringPolicy(currentPolicy, nextPolicy) {
  if (currentPolicy === nextPolicy) return true;
  if (!currentPolicy || !nextPolicy) return false;
  return currentPolicy.policyId === nextPolicy.policyId
    && currentPolicy.policyVersion === nextPolicy.policyVersion
    && Boolean(currentPolicy.acknowledgementStatus?.acknowledged)
      === Boolean(nextPolicy.acknowledgementStatus?.acknowledged);
}

export function decideStartupTracking({ policy, deviceStatus, currentSession, deviceId, trackingDesired = true }) {
  if (!trackingDesired) return "wait";
  if (!policyAllowsAutomaticTracking(policy)) return "wait";
  if (deviceStatus !== "active") return "wait";
  if (currentSession?.active) {
    return currentSession.session?.deviceId === deviceId ? "resume" : "other-device";
  }
  return "start";
}

export function reconcileTrackingSession({ localSession, currentSession, deviceId, policy, deviceStatus, trackingDesired = true }) {
  const eligible = trackingDesired && policyAllowsAutomaticTracking(policy) && deviceStatus === "active";
  if (localSession) {
    if (!eligible) return { action: "stop", session: null };
    if (currentSession?.active && currentSession.session?.deviceId === deviceId) {
      return currentSession.session.sessionId === localSession.sessionId
        ? { action: "keep", session: localSession }
        : { action: "resume", session: currentSession.session };
    }
    const matches = currentSession?.active
      && currentSession.session?.sessionId === localSession.sessionId
      && currentSession.session?.deviceId === deviceId;
    if (matches) return { action: "keep", session: localSession };
    if (!currentSession?.active && eligible) {
      return { action: "start", session: null };
    }
    return { action: "stop", session: null };
  }
  if (currentSession?.active) {
    return currentSession.session?.deviceId === deviceId && eligible
      ? { action: "resume", session: currentSession.session }
      : currentSession.session?.deviceId === deviceId
        ? { action: "stop", session: null }
        : { action: "keep", session: null };
  }
  if (eligible) {
    return { action: "start", session: null };
  }
  return { action: "keep", session: null };
}
