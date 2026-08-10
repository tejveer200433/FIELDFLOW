export function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split(/[/?#]/)[0]
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}

export function overrideIsActive(override, now = Date.now()) {
  if (!override?.overrideEndsAt) return true;
  const expiresAt = new Date(override.overrideEndsAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function overrideCoversDomain(overrideDomain, blockedDomain) {
  const allowed = normalizeDomain(overrideDomain);
  const blocked = normalizeDomain(blockedDomain);
  return Boolean(allowed && blocked && (blocked === allowed || blocked.endsWith(`.${allowed}`)));
}

export function activeBlockedDomains(blocklist, now = Date.now()) {
  const overrides = (blocklist?.overrides || []).filter(item => overrideIsActive(item, now));
  return (blocklist?.blockedDomains || [])
    .map(normalizeDomain)
    .filter(Boolean)
    .filter(domain => !overrides.some(item => overrideCoversDomain(item.domain, domain)));
}

export function isDomainBlocked(domain, blocklist, now = Date.now()) {
  const requested = normalizeDomain(domain);
  return activeBlockedDomains(blocklist, now).some(blocked =>
    requested === blocked || requested.endsWith(`.${blocked}`)
  );
}
