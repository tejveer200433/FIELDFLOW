export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function policyAcknowledgementText(policy) {
  return [
    `FieldFlow monitoring policy version ${policy.policyVersion}.`,
    `Tracking is ${policy.trackingEnabled ? "enabled" : "disabled"}.`,
    `Application-name collection is ${policy.collectApplicationNames ? "enabled" : "disabled"}.`,
    "FieldFlow collects aggregate keyboard and mouse activity counts only. It does not collect typed text, key names or codes, screenshots, clipboard content, window titles, file paths, mouse coordinates, or click targets."
  ].join(" ");
}
