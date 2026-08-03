export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const UPDATE_STARTUP_DELAY_MS = 30 * 1000;

export async function checkAndInstallAgentUpdate({
  beforeInstall,
  onStatus = () => {},
  checkImpl,
  relaunchImpl
}) {
  const checkForUpdate = checkImpl || (await import("@tauri-apps/plugin-updater")).check;
  const relaunch = relaunchImpl || (await import("@tauri-apps/plugin-process")).relaunch;
  onStatus("Checking for updates");
  const update = await checkForUpdate({ timeout: 30_000 });
  if (!update) {
    onStatus("Up to date");
    return { installed: false, version: null };
  }

  onStatus(`Preparing update ${update.version}`);
  await beforeInstall?.(update);
  onStatus(`Installing update ${update.version}`);
  await update.downloadAndInstall();
  onStatus("Restarting after update");
  await relaunch();
  return { installed: true, version: update.version };
}
