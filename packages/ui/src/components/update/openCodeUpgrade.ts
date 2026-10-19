import { z } from 'zod';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { resolveOpenCodeUpgradeStatusVersion } from './openCodeUpdateDedup';

/**
 * Transport for the OpenCode upgrade the update toast and About share. The
 * server supplies status. Older remote servers may still offer an unsafe
 * installer, so this client never forwards upgrade requests.
 */

const upgradeStatusResponse = z.object({
  available: z.boolean(),
  currentVersion: z.string().nullable().optional(),
  latestVersion: z.string().nullable().optional(),
  upgrade: z.object({ supported: z.boolean().nullable().optional() }).nullable().optional(),
});

const forkVersion = z.string().regex(/^\d+\.\d+\.\d+-internetisalie\.[1-9]\d*$/);

export type OpenCodeUpgradeStatus = {
  /** Installed OpenCode version, or null when the server could not read it. */
  currentVersion: string | null;
  /** Newer version to announce, or null when there is nothing to announce. */
  availableVersion: string | null;
  /** True only when the server can run the upgrade itself. */
  supported: boolean;
};

/** Throws on failure so a failed check never reads as "no update". */
export async function fetchOpenCodeUpgradeStatus(): Promise<OpenCodeUpgradeStatus> {
  const response = await runtimeFetch('/api/opencode/upgrade-status', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(response.statusText || 'OpenCode upgrade status check failed');
  const parsed = upgradeStatusResponse.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error('OpenCode upgrade status check failed');
  const status = parsed.data;
  const currentVersion = status.currentVersion?.trim() || null;
  const candidate = resolveOpenCodeUpgradeStatusVersion(status);
  const availableVersion = forkVersion.safeParse(candidate).success ? candidate : null;
  return { currentVersion, availableVersion, supported: false };
}

/**
 * Refuses locally, including when connected to an older remote server.
 */
export async function runOpenCodeUpgrade(fallbackError: string): Promise<string | null> {
  throw new Error(fallbackError);
}
