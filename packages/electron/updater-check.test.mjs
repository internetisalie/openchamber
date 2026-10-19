import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { checkForDesktopUpdate } from './updater-check.mjs';

const originalFetch = globalThis.fetch;
const disabled = process.env.OPENCHAMBER_DISABLE_UPDATES;
afterEach(() => { globalThis.fetch = originalFetch; if (disabled === undefined) delete process.env.OPENCHAMBER_DISABLE_UPDATES; else process.env.OPENCHAMBER_DISABLE_UPDATES = disabled; });

test('checks only the fork without arming electron-updater or a cached payload', async () => {
  delete process.env.OPENCHAMBER_DISABLE_UPDATES;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([url, options]);
    return Response.json({ tag_name: 'v2.4.0-internetisalie.10', draft: false, prerelease: false });
  };
  const result = await checkForDesktopUpdate({ autoUpdater: { checkForUpdates: () => assert.fail('Electron updater called') }, pendingUpdate: { downloaded: true } });
  assert.equal(result.available, true);
  assert.equal(result.installBlocked, 'manual-install');
  assert.equal(calls[0][0], 'https://api.github.com/repos/internetisalie/openchamber/releases/latest');
  assert.equal(calls.length, 1);
});

test('missing or failed metadata remains a failed check', async () => {
  delete process.env.OPENCHAMBER_DISABLE_UPDATES;
  globalThis.fetch = async () => new Response('', { status: 404 });
  await assert.rejects(checkForDesktopUpdate(), /HTTP 404/);
});
