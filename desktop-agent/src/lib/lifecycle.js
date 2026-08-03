export function policyAllowsAutomaticTracking(policy) {
  if (!policy?.trackingEnabled) return false;
  return !policy.requireAcknowledgement || Boolean(policy.acknowledgementStatus?.acknowledged);
}

export function decideStartupTracking({ policy, deviceStatus, currentSession, deviceId }) {
  if (!policyAllowsAutomaticTracking(policy)) return "wait";
  if (deviceStatus !== "active") return "wait";
  if (currentSession?.active) {
    return currentSession.session?.deviceId === deviceId ? "resume" : "other-device";
  }
  return "start";
}

export function reconcileTrackingSession({ localSession, currentSession, deviceId }) {
  if (localSession) {
    const matches = currentSession?.active
      && currentSession.session?.sessionId === localSession.sessionId
      && currentSession.session?.deviceId === deviceId;
    return matches ? { action: "keep", session: localSession } : { action: "stop", session: null };
  }
  if (currentSession?.active && currentSession.session?.deviceId === deviceId) {
    return { action: "resume", session: currentSession.session };
  }
  return { action: "keep", session: null };
}
