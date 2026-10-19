import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { getOpenCodeUpgradeStatus, upgradeManagedOpenCode, type OpenCodeUpgradeManager } from './opencode-upgrade-runtime';

const originalFetch = globalThis.fetch;
const originalEnvironment = { ...process.env };
beforeEach(() => { delete process.env.OPENCHAMBER_DISABLE_UPDATES; delete process.env.OPENCODE_DISABLE_AUTOUPDATE; });
afterEach(() => { globalThis.fetch = originalFetch; process.env = { ...originalEnvironment }; });
const manager: OpenCodeUpgradeManager = {
  getApiUrl: () => 'http://127.0.0.1:4096', getOpenCodeAuthHeaders: () => ({}),
  getDebugInfo: () => ({ mode: 'managed', cliPath: '/test/opencode' }),
  upgradeCli: async () => { assert.fail('CLI upgrade invoked'); },
};

test('refuses managed, external and missing-manager upgrades before network or CLI calls', async () => {
  globalThis.fetch = async () => { assert.fail('Network used'); };
  for (const candidate of [manager, undefined, { ...manager, getDebugInfo: () => ({ mode: 'external' as const, cliPath: null }) }]) {
    const result = await upgradeManagedOpenCode(candidate);
    assert.equal(result.status, 409);
    assert.equal(result.body.code, 'FORK_MANUAL_UPDATE_REQUIRED');
  }
});

test('reads the fork release and leaves replacement unsupported', async () => {
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    return Response.json(url.endsWith('/api/info') ? { version: '2.0.32-internetisalie.1' } : { tag_name: 'v2.0.32-internetisalie.2', draft: false, prerelease: false });
  };
  const status = await getOpenCodeUpgradeStatus(manager);
  assert.equal(status.available, true);
  assert.equal(status.upgrade.supported, false);
  assert.deepEqual(urls, ['http://127.0.0.1:4096/api/info', 'https://api.github.com/repos/internetisalie/opencode/releases/latest']);
});
