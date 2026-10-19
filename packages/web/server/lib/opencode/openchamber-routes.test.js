import { afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerOpenChamberRoutes } from './openchamber-routes.js';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each(['web', 'desktop', 'ssh-remote', 'docker'])('refuses %s installs without touching the runtime', async (runtime) => {
  const touched = () => { throw new Error('Runtime was touched'); };
  const app = express();
  registerOpenChamberRoutes(app, new Proxy({}, { get: (_target, key) => key === 'modelsDevApiUrl' || key === 'modelsMetadataCacheTtl' || key === 'fetchFreeZenModels' || key === 'getCachedZenModels' ? undefined : touched }));
  vi.stubEnv('OPENCHAMBER_RUNTIME', runtime);
  vi.stubGlobal('fetch', touched);
  const result = await request(app).post('/api/openchamber/update-install').send({ version: '999.0.0', force: true }).expect(409);
  expect(result.body).toMatchObject({ success: false, code: 'FORK_MANUAL_UPDATE_REQUIRED', releaseUrl: 'https://github.com/internetisalie/openchamber/releases' });
});

it('does not report an unavailable feed as up to date', async () => {
  vi.stubEnv('OPENCHAMBER_DISABLE_UPDATES', '');
  vi.stubGlobal('fetch', async () => new Response('', { status: 503 }));
  const app = express();
  registerOpenChamberRoutes(app, {});
  const result = await request(app).get('/api/openchamber/update-check').expect(502);
  expect(result.body.available).toBeNull();
});
