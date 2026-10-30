import pkg from '../../package.json' with { type: 'json' };
import { fetchForkRelease, FORK_UPDATE_ERROR, isNewerForkVersion } from './fork-updates.js';

export function getCurrentVersion() {
  return pkg.forkRelease || pkg.version;
}

export async function checkForUpdates() {
  const currentVersion = getCurrentVersion();
  if (['1', 'true'].includes(process.env.OPENCHAMBER_DISABLE_UPDATES?.toLowerCase())) {
    return { available: false, disabled: true, currentVersion, installBlocked: 'manual-install' };
  }
  const release = await fetchForkRelease('openchamber');
  return { ...release, currentVersion, available: isNewerForkVersion(release.version, currentVersion) };
}

// Refuse at the command boundary, including callers outside the HTTP route.
export function getUpdateCommand() {
  throw new Error(FORK_UPDATE_ERROR);
}

export function executeUpdate() {
  return { success: false, exitCode: 1, error: FORK_UPDATE_ERROR };
}
