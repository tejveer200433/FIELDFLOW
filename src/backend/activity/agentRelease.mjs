const semverPattern = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const supportedTargets = new Set(["windows"]);
const supportedArchitectures = new Set(["x86_64", "aarch64", "i686"]);

export function compareAgentVersions(left, right) {
  const a = semverPattern.exec(String(left));
  const b = semverPattern.exec(String(right));
  if (!a || !b) return null;
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(a[index]) - Number(b[index]);
    if (difference) return Math.sign(difference);
  }
  if (a[4] === b[4]) return 0;
  if (!a[4]) return 1;
  if (!b[4]) return -1;
  return a[4].localeCompare(b[4]);
}

export function resolveAgentRelease({ target, arch, currentVersion, environment }) {
  if (!supportedTargets.has(target) || !supportedArchitectures.has(arch)) {
    return { status: 204, release: null };
  }
  const version = environment.ACTIVITY_AGENT_RELEASE_VERSION?.trim();
  const downloadUrl = environment.ACTIVITY_AGENT_RELEASE_URL?.trim();
  const signature = environment.ACTIVITY_AGENT_RELEASE_SIGNATURE?.trim();
  if (!version && !downloadUrl && !signature) return { status: 204, release: null };

  const comparison = compareAgentVersions(version, currentVersion);
  let parsedUrl;
  try {
    parsedUrl = new URL(downloadUrl);
  } catch {
    return { status: 503, release: null };
  }
  if (
    comparison === null
    || parsedUrl.protocol !== "https:"
    || parsedUrl.username
    || parsedUrl.password
    || typeof signature !== "string"
    || signature.length < 20
    || signature.length > 4096
  ) {
    return { status: 503, release: null };
  }
  if (comparison <= 0) return { status: 204, release: null };

  return {
    status: 200,
    release: {
      version,
      url: parsedUrl.toString(),
      signature,
      notes: environment.ACTIVITY_AGENT_RELEASE_NOTES?.slice(0, 2000) || "FieldFlow Activity Agent update",
      pub_date: environment.ACTIVITY_AGENT_RELEASE_PUBLISHED_AT || undefined
    }
  };
}
