import { fetchForkRelease, FORK_UPDATE_CODE, FORK_UPDATE_ERROR, isNewerForkVersion } from '../../web/server/lib/fork-updates.js';
import { readOpenCodeInfo } from '../../web/server/lib/opencode/compatibility.js';

export type OpenCodeUpgradeManager = {
  getApiUrl(): string | null;
  getOpenCodeAuthHeaders(): Record<string, string>;
  getDebugInfo(): { mode: 'managed' | 'external'; cliPath: string | null };
  upgradeCli(): Promise<void>;
};

const upgrade = { supported: false, manager: 'administrator', reason: 'manual-install' };

export const getOpenCodeUpgradeStatus = async (manager?: OpenCodeUpgradeManager) => {
  const apiUrl = manager?.getApiUrl();
  if (!apiUrl || !manager) return { available: null, currentVersion: null, latestVersion: null, upgrade };
  try {
    const disabled = ['1', 'true'].includes(process.env.OPENCHAMBER_DISABLE_UPDATES?.toLowerCase() ?? '')
      || ['1', 'true'].includes(process.env.OPENCODE_DISABLE_AUTOUPDATE?.toLowerCase() ?? '');
    const [response, release] = await Promise.all([
      fetch(new URL('api/info', `${apiUrl.replace(/\/+$/, '')}/`).toString(), { headers: { Accept: 'application/json', ...manager.getOpenCodeAuthHeaders() } }),
      disabled ? Promise.resolve(null) : fetchForkRelease('opencode'),
    ]);
    const info = await readOpenCodeInfo(response);
    if (!info) throw new Error('Failed to read OpenCode version.');
    return {
      available: disabled ? false : release ? isNewerForkVersion(release.version, info.version) : null,
      currentVersion: info.version, latestVersion: release?.version ?? null, releaseUrl: release?.releaseUrl, upgrade,
    };
  } catch (error) {
    return { available: null, error: error instanceof Error ? error.message : 'Failed to check fork releases.', upgrade };
  }
};

export const upgradeManagedOpenCode = async (_manager?: OpenCodeUpgradeManager) => ({
  status: 409,
  body: { success: false, code: FORK_UPDATE_CODE, error: FORK_UPDATE_ERROR, upgrade },
});
