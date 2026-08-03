export function browserNameFromUserAgent(userAgent = "") {
  const value = String(userAgent);
  if (/Edg\//i.test(value)) return "edge";
  if (/OPR\//i.test(value)) return "opera";
  if (/Vivaldi\//i.test(value)) return "vivaldi";
  if (/YaBrowser\//i.test(value)) return "yandex";
  if (/Firefox\//i.test(value)) return "firefox";
  if (/Chrome\//i.test(value)) return "chrome";
  if (/Safari\//i.test(value)) return "safari";
  return "browser";
}

export async function detectBrowserName(runtimeNavigator = globalThis.navigator) {
  try {
    if (await runtimeNavigator?.brave?.isBrave?.()) return "brave";
  } catch {
    // Fall back to the user agent when Brave detection is unavailable.
  }
  return browserNameFromUserAgent(runtimeNavigator?.userAgent);
}
