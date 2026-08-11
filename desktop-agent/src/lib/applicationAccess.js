export function normalizeApplicationKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.exe$/, "");
}

export function isApplicationApproved(application, approvedApplications) {
  const applicationKey = normalizeApplicationKey(application);
  if (!applicationKey) return false;
  return approvedApplications.some(value => {
    const approvedKey = normalizeApplicationKey(value);
    return approvedKey && (
      applicationKey === approvedKey
      || applicationKey.startsWith(`${approvedKey}.`)
      || approvedKey.startsWith(`${applicationKey}.`)
    );
  });
}
