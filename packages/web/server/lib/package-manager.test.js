import { afterEach, expect, it, vi } from 'vitest';
import { checkForUpdates, executeUpdate, getCurrentVersion, getUpdateCommand } from './package-manager.js';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('checks only fork GitHub metadata without transmitting client usage', async () => {
  const fetch = vi.fn(async () => Response.json({ tag_name: 'v2.4.0-internetisalie.10', draft: false, prerelease: false }));
  vi.stubGlobal('fetch', fetch);
  vi.stubEnv('OPENCHAMBER_DISABLE_UPDATES', '');
  vi.stubEnv('OPENCHAMBER_UPDATE_API_URL', 'https://upstream.invalid');
  const info = await checkForUpdates({ currentVersion: '99.0.0', reportUsage: true });
  expect(info).toMatchObject({ available: true, currentVersion: getCurrentVersion(), version: '2.4.0-internetisalie.10', installBlocked: 'manual-install' });
  expect(fetch).toHaveBeenCalledExactlyOnceWith('https://api.github.com/repos/internetisalie/openchamber/releases/latest', expect.objectContaining({ redirect: 'error' }));
  expect(fetch.mock.calls[0][1].body).toBeUndefined();
});

it('does not turn a failed check into an up-to-date result or fall back', async () => {
  const fetch = vi.fn(async () => new Response('', { status: 404 }));
  vi.stubGlobal('fetch', fetch);
  vi.stubEnv('OPENCHAMBER_DISABLE_UPDATES', '');
  await expect(checkForUpdates()).rejects.toThrow('HTTP 404');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('does not fetch when checks are disabled', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  vi.stubEnv('OPENCHAMBER_DISABLE_UPDATES', 'true');
  expect(await checkForUpdates()).toMatchObject({ available: false, disabled: true });
  expect(fetch).not.toHaveBeenCalled();
});

it('never generates or executes a package-manager replacement command', () => {
  for (const pm of ['bun', 'npm', 'yarn', 'pnpm']) {
    expect(() => getUpdateCommand(pm, { targetVersion: 'latest' })).toThrow('In-place updates are disabled');
    expect(executeUpdate(pm)).toMatchObject({ success: false, exitCode: 1 });
  }
});
