export const policyRanges = {
  idleThresholdSeconds: [30, 86400],
  sampleIntervalSeconds: [10, 3600],
  uploadIntervalSeconds: [30, 86400],
  offlineSyncLimitSeconds: [0, 2592000],
  heartbeatIntervalSeconds: [15, 3600],
  retentionDays: [1, 3650]
};

export const policyFields = [
  "trackingEnabled",
  "idleThresholdSeconds",
  "sampleIntervalSeconds",
  "uploadIntervalSeconds",
  "offlineSyncLimitSeconds",
  "heartbeatIntervalSeconds",
  "collectApplicationNames",
  "requireAcknowledgement",
  "retentionDays",
  "websiteBlockingEnabled",
  "blockedDomains",
  "collectCodingProjectNames"
];

export function policyFormValues(policy) {
  return {
    trackingEnabled: Boolean(policy?.trackingEnabled),
    idleThresholdSeconds: Number(policy?.idleThresholdSeconds ?? 300),
    sampleIntervalSeconds: Number(policy?.sampleIntervalSeconds ?? 60),
    uploadIntervalSeconds: Number(policy?.uploadIntervalSeconds ?? 300),
    offlineSyncLimitSeconds: Number(policy?.offlineSyncLimitSeconds ?? 86400),
    heartbeatIntervalSeconds: Number(policy?.heartbeatIntervalSeconds ?? 60),
    collectApplicationNames: Boolean(policy?.collectApplicationNames),
    requireAcknowledgement: policy?.requireAcknowledgement ?? true,
    retentionDays: Number(policy?.retentionDays ?? 90),
    websiteBlockingEnabled: Boolean(policy?.websiteBlockingEnabled),
    blockedDomains: Array.isArray(policy?.blockedDomains) ? policy.blockedDomains : [],
    collectCodingProjectNames: Boolean(policy?.collectCodingProjectNames)
  };
}

export function validatePolicy(values) {
  const errors = {};
  for (const [field, [minimum, maximum]] of Object.entries(policyRanges)) {
    const value = Number(values[field]);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      errors[field] = `Enter a whole number from ${minimum} to ${maximum}.`;
    }
  }
  return errors;
}

function changed(before, after) {
  if (Array.isArray(before) || Array.isArray(after)) {
    return JSON.stringify(before) !== JSON.stringify(after);
  }
  return before !== after;
}

export function policyChanges(currentPolicy, nextValues) {
  const current = policyFormValues(currentPolicy);
  return policyFields
    .filter(field => changed(current[field], nextValues[field]))
    .map(field => ({ field, before: current[field], after: nextValues[field] }));
}
