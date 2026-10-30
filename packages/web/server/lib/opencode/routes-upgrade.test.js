import { afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerOpenCodeRoutes } from './routes.js';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const createApp = () => {
  const app = express(); app.use(express.json());
  const replace = vi.fn(async () => { throw new Error('Replacement attempted'); });
  registerOpenCodeRoutes(app, {
    getOpenCodeUpgradeCapability: () => ({ supported: false, manager: 'administrator', reason: 'manual-install' }),
    getOpenCodeCompatibility: async () => ({ canInstall: true }),
    installOpenCodeV2: replace, upgradeOpenCodeCli: replace,
    buildOpenCodeUrl: () => 'http://127.0.0.1:4096/api/info', getOpenCodeAuthHeaders: () => ({}),
  });
  return { app, replace };
};

it.each(['/api/opencode/upgrade', '/api/opencode/install-v2'])('refuses direct %s requests without invoking an installer', async (route) => {
  const { app, replace } = createApp();
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const result = await request(app).post(route).send({ force: true, version: 'latest' }).expect(409);
  expect(result.body.code).toBe('FORK_MANUAL_UPDATE_REQUIRED');
  expect(replace).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('checks the OpenCode fork and compares numbered revisions', async () => {
  vi.stubEnv('OPENCHAMBER_DISABLE_UPDATES', '');
  vi.stubEnv('OPENCODE_DISABLE_AUTOUPDATE', '');
  const fetch = vi.fn(async (url) => Response.json(String(url).endsWith('/api/info')
    ? { version: '2.0.32-internetisalie.1' }
    : { tag_name: 'v2.0.32-internetisalie.2', draft: false, prerelease: false }));
  vi.stubGlobal('fetch', fetch);
  const { app } = createApp();
  const result = await request(app).get('/api/opencode/upgrade-status').expect(200);
  expect(result.body).toMatchObject({ available: true, latestVersion: '2.0.32-internetisalie.2', upgrade: { supported: false } });
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(['http://127.0.0.1:4096/api/info', 'https://api.github.com/repos/internetisalie/opencode/releases/latest']);
});

it.each([
  ['/api/opencode/upgrade-status', 'available'],
  ['/api/opencode/version', 'version'],
])('answers %s when OpenCode accepts the request but never responds', async (route, field) => {
  vi.stubEnv('OPENCHAMBER_DISABLE_UPDATES', '');
  vi.stubEnv('OPENCODE_DISABLE_AUTOUPDATE', '');
  vi.stubGlobal('fetch', vi.fn((url, init) => {
    if (!String(url).endsWith('/api/info')) return Promise.resolve(Response.json({ tag_name: 'v2.0.32-internetisalie.2', draft: false, prerelease: false }));
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    });
  }));
  const { app } = createApp();
  const response = await request(app).get(route).timeout({ deadline: 5_000 }).expect(500);
  expect(response.body).toEqual({ [field]: null, error: expect.any(String) });
  expect(response.body.error).not.toBe('');
});

it.each(['OPENCHAMBER_DISABLE_UPDATES', 'OPENCODE_DISABLE_AUTOUPDATE'])('honors %s without a release request', async (flag) => {
  vi.stubEnv(flag, '1');
  const fetch = vi.fn(async () => Response.json({ version: '2.0.32-internetisalie.1' }));
  vi.stubGlobal('fetch', fetch);
  const { app } = createApp();
  const result = await request(app).get('/api/opencode/upgrade-status').expect(200);
  expect(result.body).toMatchObject({ available: false, latestVersion: null });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('preserves unknown status when the fork feed fails', async () => {
  vi.stubEnv('OPENCHAMBER_DISABLE_UPDATES', '');
  vi.stubEnv('OPENCODE_DISABLE_AUTOUPDATE', '');
  vi.stubGlobal('fetch', async (url) => String(url).endsWith('/api/info')
    ? Response.json({ version: '2.0.32-internetisalie.1' }) : new Response('', { status: 404 }));
  const { app } = createApp();
  const result = await request(app).get('/api/opencode/upgrade-status').expect(500);
  expect(result.body.available).toBeNull();
});
