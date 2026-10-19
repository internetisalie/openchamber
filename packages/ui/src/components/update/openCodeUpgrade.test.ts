import { afterEach, expect, test } from 'bun:test';
import { fetchOpenCodeUpgradeStatus, runOpenCodeUpgrade } from './openCodeUpgrade';
import { fetchOpenCodeCompatibility, recoverOpenCode } from '@/lib/opencode/compatibility';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('ignores an older server offering an upstream upgrade', async () => {
  globalThis.fetch = async () => Response.json({ available: true, currentVersion: '2.0.32-internetisalie.1', latestVersion: '2.0.33', upgrade: { supported: true } });
  expect(await fetchOpenCodeUpgradeStatus()).toEqual({ currentVersion: '2.0.32-internetisalie.1', availableVersion: null, supported: false });
});

test('unknown availability stays a failed check', async () => {
  globalThis.fetch = async () => Response.json({ available: null, error: 'Fork metadata unavailable' });
  await expect(fetchOpenCodeUpgradeStatus()).rejects.toThrow('OpenCode upgrade status check failed');
});

test('announces a fork release while refusing the old server installer', async () => {
  globalThis.fetch = async () => Response.json({ available: true, latestVersion: '2.0.32-internetisalie.2', upgrade: { supported: true } });
  expect(await fetchOpenCodeUpgradeStatus()).toMatchObject({ availableVersion: '2.0.32-internetisalie.2', supported: false });
});

test('upgrade and install requests never leave this client', async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return Response.json({ success: true }); };
  await expect(runOpenCodeUpgrade('Manual fork installation required')).rejects.toThrow('Manual fork installation required');
  await expect(recoverOpenCode('install-v2')).rejects.toThrow('Automatic installation is disabled');
  expect(requests).toBe(0);
});

test('compatibility cannot expose an older server install action', async () => {
  globalThis.fetch = async () => Response.json({ state: 'incompatible', installation: 'managed', version: '1.18.30', canInstall: true });
  expect((await fetchOpenCodeCompatibility()).canInstall).toBe(false);
});
