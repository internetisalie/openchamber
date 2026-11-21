import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import express from 'express';
import request from 'supertest';
import { afterEach, expect, test, vi } from 'vitest';

import { proxyGuestOpenCodeRequest } from '@openchamber/ui/lib/guests/opencode-request';
import { parseGuestCatalogJson } from '@openchamber/ui/lib/guests/parse';
import { requestGuestPluginRoute } from '@openchamber/ui/lib/opencode/guest-plugin-request';
import { listInstalledGuests, noteGuestPackageChanged } from './catalog.js';
import { createGuestOpenCodeProvider } from './opencode-provider/index.js';
import { registerGuestRoutes } from './routes.js';

const cleanups = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const fixture = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-plugin-client-'));
  cleanups.push(() => fs.rm(root, { recursive: true, force: true }));
  vi.stubEnv('OPENCHAMBER_ENTERPRISE_MODE', '0');
  vi.stubEnv('OPENCHAMBER_ALLOW_LOCAL_EXTENSIONS', '0');
  const app = express();
  registerGuestRoutes(app, { openchamberDataDir: root, resolveGitBinaryForSpawn: () => 'git' });
  const persistPath = path.join(root, 'extensions.json');
  const packageRoot = path.join(root, 'client');
  await fs.mkdir(packageRoot);
  await fs.writeFile(path.join(packageRoot, 'index.html'), '<html></html>');
  await fs.writeFile(path.join(packageRoot, 'service.mjs'), '');
  const manifest = (plugins, providesReads) => {
    const contributes = {
      panel: { id: 'client', name: 'Plugin client', icon: 'window', entry: 'index.html' },
      openCode: { plugins },
    };
    if (providesReads) contributes.service = { entry: 'service.mjs', runtime: 'host', provides: ['opencode'] };
    return fs.writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({
      name: 'client', version: '1.0.0', openchamber: { apiVersion: 1, contributes },
    }));
  };
  const plugin = { id: 'example-plugin', methods: ['GET'] };
  await manifest([plugin], false);
  const install = () => request(app).post('/api/guests').send({ path: packageRoot });
  await install().expect(201);
  const legacyStore = async ({ scoped = true, service = false } = {}) => {
    const scope = {};
    if (scoped) scope.opencode = [plugin];
    if (service) scope.service = { exec: [], sockets: [] };
    await fs.writeFile(persistPath, JSON.stringify({
      paths: [packageRoot], sources: { [packageRoot]: 'path' },
      capabilityGrants: { client: service ? ['service', 'opencode'] : ['opencode'] },
      capabilityScopes: { client: scope },
    }));
    noteGuestPackageChanged(persistPath, 'client');
  };
  const listing = async () => {
    const response = await request(app).get('/api/guests').expect(200);
    return parseGuestCatalogJson(response.text)?.guests.find((guest) => guest.id === 'client');
  };
  const approve = (granted) => request(app).put('/api/guests/client/capabilities').send({ granted });
  const upstream = vi.fn(async () => new Response('plugin response'));
  const call = async ({ pluginId = 'example-plugin', method = 'GET' } = {}) => (
    proxyGuestOpenCodeRequest(await listing(), { pluginId, method, path: '/status' }, root,
      (outgoing, directory) => requestGuestPluginRoute(outgoing, directory, upstream))
  );
  return { manifest, plugin, legacyStore, listing, approve, install, call, upstream, persistPath };
};

test('enterprise denial overrides an installed guest’s exact legacy plugin grant', async () => {
  const f = await fixture();
  await f.legacyStore();
  expect(await f.call()).toEqual({ ok: true, result: { status: 200, body: 'plugin response' } });
  expect(f.upstream).toHaveBeenCalledWith('/api/plugins/example-plugin/status', expect.objectContaining({ method: 'GET' }));
  f.upstream.mockClear();

  vi.stubEnv('OPENCHAMBER_ENTERPRISE_MODE', '1');
  expect(await f.listing()).toMatchObject({
    enterpriseBlocked: ['opencode-plugin'], capabilities: { requested: ['opencode-plugin'], granted: [] },
  });
  expect(await f.call()).toMatchObject({ ok: false, code: 'NOT_GRANTED' });
  expect(f.upstream).not.toHaveBeenCalled();
  const blocked = { error: 'enterprise-mode', capabilities: ['opencode-plugin'] };
  expect((await f.approve(['opencode-plugin']).expect(403)).body).toEqual(blocked);
  expect((await f.install().expect(403)).body).toEqual(blocked);

  vi.stubEnv('OPENCHAMBER_ALLOW_LOCAL_EXTENSIONS', '1');
  expect(await f.call()).toMatchObject({ ok: true });
  expect(f.upstream).toHaveBeenCalledTimes(1);
});

test('a legacy grant covers only its exact plugin scope and never becomes a service read grant', async () => {
  const f = await fixture();
  await f.legacyStore();
  expect((await f.listing()).capabilities).toEqual({ requested: ['opencode-plugin'], granted: ['opencode-plugin'] });
  expect(await f.call({ method: 'POST' })).toMatchObject({ ok: false, code: 'NOT_GRANTED' });
  expect(await f.call({ pluginId: 'another-plugin' })).toMatchObject({ ok: false, code: 'NOT_GRANTED' });

  for (const plugins of [
    [{ ...f.plugin, methods: ['GET', 'POST'] }],
    [f.plugin, { id: 'another-plugin', methods: ['GET'] }],
  ]) {
    await f.manifest(plugins, false);
    noteGuestPackageChanged(f.persistPath, 'client');
    expect((await f.listing()).capabilities.granted).toEqual([]);
    expect(await f.call()).toMatchObject({ ok: false, code: 'NOT_GRANTED' });
  }

  await f.manifest([f.plugin], false);
  await f.legacyStore({ scoped: false });
  expect((await f.listing()).capabilities).toEqual({ requested: ['opencode-plugin'], granted: [] });
  expect(await f.call()).toMatchObject({ ok: false, code: 'NOT_GRANTED' });

  await f.manifest([f.plugin], true);
  noteGuestPackageChanged(f.persistPath, 'client');
  await f.approve(['service', 'opencode-plugin', 'opencode']).expect(200);
  const buildOpenCodeUrl = vi.fn();
  const provider = createGuestOpenCodeProvider({
    currentGuest: async () => (await listInstalledGuests({ persistPath: f.persistPath }))[0],
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders: () => ({}),
  });
  cleanups.push(() => provider.stop());
  // A lease issued under explicit approval must not dispatch a read once
  // the catalog holds only legacy approvals.
  const { OPENCHAMBER_OPENCODE_URL: url } = await provider.environmentFor({ guestId: 'client', token: 'fixture-token' });
  for (const scoped of [true, false]) {
    await f.legacyStore({ scoped, service: true });
    expect((await f.listing()).capabilities).toEqual({
      requested: ['service', 'opencode-plugin', 'opencode'], granted: scoped ? ['service', 'opencode-plugin'] : ['service'],
    });
    expect(await f.call()).toMatchObject({ ok: false, code: 'NOT_GRANTED' });
    const response = await fetch(`${url}/api/session`, { headers: { Authorization: 'Bearer fixture-token' } });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_GRANTED' } });
  }
  expect(f.upstream).not.toHaveBeenCalled();
  expect(buildOpenCodeUrl).not.toHaveBeenCalled();
});
