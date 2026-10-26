import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { checkForDesktopUpdate } from './updater-check.mjs';
import webPackage from '../web/package.json' with { type: 'json' };

const [major, minor, patch] = webPackage.version.split('.');
const nextVersion = `${major}.${minor}.${Number(patch) + 1}-internetisalie.1`;

const originalFetch = globalThis.fetch;
const disabled = process.env.OPENCHAMBER_DISABLE_UPDATES;
afterEach(() => { globalThis.fetch = originalFetch; if (disabled === undefined) delete process.env.OPENCHAMBER_DISABLE_UPDATES; else process.env.OPENCHAMBER_DISABLE_UPDATES = disabled; });

test('checks only the fork without arming electron-updater or a cached payload', async () => {
  delete process.env.OPENCHAMBER_DISABLE_UPDATES;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([url, options]);
    return Response.json({ tag_name: `v${nextVersion}`, draft: false, prerelease: false });
  };
  const result = await checkForDesktopUpdate({ autoUpdater: { checkForUpdates: () => assert.fail('Electron updater called') }, pendingUpdate: { downloaded: true } });
  assert.equal(result.currentVersion, webPackage.forkRelease);
  assert.equal(result.version, nextVersion);
  if (webPackage.forkRelease === `${webPackage.version}-internetisalie.dev`) {
    assert.equal(result.available, null);
  } else {
    assert.match(webPackage.forkRelease, /^\d+\.\d+\.\d+-internetisalie\.[1-9]\d*$/);
    assert.equal(result.available, true);
  }
  assert.equal(result.installBlocked, 'manual-install');
  assert.equal(calls[0][0], 'https://api.github.com/repos/internetisalie/openchamber/releases/latest');
  assert.equal(calls.length, 1);
});

test('missing or failed metadata remains a failed check', async () => {
  delete process.env.OPENCHAMBER_DISABLE_UPDATES;
  globalThis.fetch = async () => new Response('', { status: 404 });
  await assert.rejects(checkForDesktopUpdate(), /HTTP 404/);
});
