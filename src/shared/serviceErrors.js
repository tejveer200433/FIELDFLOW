const transientStatuses = new Set([0, 408, 425, 429]);
const transientCodes = [
  /^PGRST00[0-3]$/,
  /^08/,
  /^53/,
  /^57P0[1-3]$/
];

export function isTransientServiceError(error) {
  if (!error) return false;

  const status = Number(error.status ?? error.statusCode);
  if (transientStatuses.has(status) || status >= 500) return true;

  const code = String(error.code || "").toUpperCase();
  if (transientCodes.some(pattern => pattern.test(code))) return true;

  const message = [error.message, error.details, error.hint, error.cause?.message]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /failed to fetch|fetch failed|network|timed?\s*out|timeout|connection|connecttimeout|econn|enotfound|dns|socket|temporarily unavailable|service unavailable/.test(message);
}
