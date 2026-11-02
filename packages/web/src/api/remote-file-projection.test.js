import express from 'express';
import http from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createRemoteWorkspaceFiles } from '../../server/lib/opencode/remote-workspace-files.js';
import { registerRemoteWorkspaceFileRoutes } from '../../server/lib/opencode/remote-workspace-file-routes.js';
import { createContentCachedFiles } from '@openchamber/ui/contexts/content-cache-owner';
import { createWebFilesAPI, createWebWorkspaceFileSourceResolver } from './files';

const root = '/projection-workspace';
const missingPath = `${root}/missing.txt`;
const sourceA = 'projection-source-a';
const sourceB = 'projection-source-b';
const sourceHeader = 'X-OpenChamber-File-Source';
const addressSchema = z.object({ port: z.number().int().positive() });

/** @type {import('node:http').Server[]} */
const running = [];
/** @type {Array<() => void>} */
const disposers = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0)) dispose();
  for (const server of running.splice(0).reverse()) {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

/** @param {ReturnType<typeof express>} app */
const listen = async (app) => {
  const server = http.createServer(app);
  running.push(server);
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  return `http://127.0.0.1:${addressSchema.parse(server.address()).port}`;
};

/** @param {'scoped' | 'missing-header' | 'wrong-source' | 'conflict' | 'replace-after-read'} mode */
const fixture = async (mode = 'scoped') => {
  let currentSource = sourceA;
  let missingStats = 0;
  let missingReads = 0;
  let localFallbackCalls = 0;
  /** @type {Array<{ pathname: string; directory: string | null; authorization: string | undefined }>} */
  const providerCalls = [];
  const provider = express();
  provider.use((req, res) => {
    const url = new URL(req.originalUrl, 'http://provider.test');
    providerCalls.push({ pathname: url.pathname, directory: url.searchParams.get('location[directory]'),
      authorization: req.get('authorization') });
    if (url.searchParams.get('location[directory]') !== root || req.get('authorization') !== 'Bearer projection-fixture') {
      return res.status(400).end();
    }
    if (url.pathname === '/api/fs/stat' && url.searchParams.get('path') === '') {
      return res.json({ location: { directory: root }, sourceIdentity: currentSource,
        data: { path: '', exists: true, isFile: false, size: 4096, mtimeMs: 321 } });
    }
    const stat = url.pathname === '/api/fs/stat' && url.searchParams.get('path') === 'missing.txt';
    const read = url.pathname === '/api/fs/read/missing.txt';
    if (!stat && !read) return res.status(400).end();
    if (stat) missingStats++;
    if (read) missingReads++;
    if (mode === 'conflict') {
      return res.status(409).json({ _tag: 'ConflictError', kind: 'remote-source-changed', message: 'Workspace generation changed' });
    }
    if (mode !== 'missing-header') res.setHeader(sourceHeader, mode === 'wrong-source' ? sourceB : currentSource);
    if (read && mode === 'replace-after-read') currentSource = sourceB;
    return res.status(404).json({ _tag: 'FileNotFoundError', kind: 'not-found', message: 'Scoped file is absent' });
  });
  const providerOrigin = await listen(provider);
  const remoteWorkspaceFiles = createRemoteWorkspaceFiles({
    resolve: () => ({ mode: 'remote', workspaceID: 'projection-workspace-id', directory: root }),
    buildOpenCodeUrl: (route) => `${providerOrigin}${route}`,
    getOpenCodeAuthHeaders: () => ({ Authorization: 'Bearer projection-fixture' }),
    fetchImpl: fetch,
  });
  const browser = express();
  registerRemoteWorkspaceFileRoutes(browser, { remoteWorkspaceFiles });
  browser.use((_req, res) => {
    localFallbackCalls++;
    res.status(500).send('Unexpected local filesystem fallthrough');
  });
  const browserOrigin = await listen(browser);
  /** @type {Array<{ operation: string; status: number; sourceIdentity: string | null; body: string }>} */
  const projections = [];
  /** @type {import('./files').WebFileDependencies} */
  const dependencies = {
    fetch: async (route, options = {}) => {
      const { query, ...init } = options;
      const url = new URL(route, browserOrigin);
      const entries = query instanceof URLSearchParams ? query.entries() : Object.entries(query ?? {});
      for (const [name, value] of entries) {
        if (value !== undefined && value !== null) url.searchParams.set(name, String(value));
      }
      const response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(2000) });
      if (url.searchParams.get('path') === missingPath) {
        projections.push({ operation: url.pathname, status: response.status,
          sourceIdentity: response.headers.get(sourceHeader), body: await response.clone().text() });
      }
      return response;
    },
    runtime: { getRuntimeKey: () => 'projection-runtime', subscribeRuntimeEndpointWillChange: () => () => {} },
  };
  const resolveWorkspaceFileSource = createWebWorkspaceFileSourceResolver({ getDirectory: () => root, dependencies });
  const files = createWebFilesAPI({ getDirectory: () => root, dependencies, resolveWorkspaceFileSource });
  const cached = createContentCachedFiles(files);
  disposers.push(cached.dispose);
  const counts = () => ({ missingStats, missingReads, localFallbackCalls });
  const expectRemoteOnly = () => {
    expect(localFallbackCalls).toBe(0);
    expect(providerCalls.length).toBeGreaterThan(0);
    expect(providerCalls.length).toBeLessThan(40);
    for (const call of providerCalls) {
      expect(call.directory).toBe(root);
      expect(call.authorization).toBe('Bearer projection-fixture');
    }
  };
  return { files, cached: cached.files, projections, counts, expectRemoteOnly };
};

describe('remote optional absence through the real server projection and WebFilesAPI', () => {
  it('projects a fenced optional stat and completes the content-cache stat/read/stat path without fabricated metadata', async () => {
    const f = await fixture();
    expect(await f.cached.readFile(missingPath, { directory: root, optional: true }))
      .toEqual({ path: missingPath, content: '', sourceIdentity: sourceA });
    expect(f.projections.map(({ operation, status, sourceIdentity }) => ({ operation, status, sourceIdentity }))).toEqual([
      { operation: '/api/fs/stat', status: 200, sourceIdentity: sourceA },
      { operation: '/api/fs/read', status: 200, sourceIdentity: sourceA },
      { operation: '/api/fs/stat', status: 200, sourceIdentity: sourceA },
    ]);
    for (const projection of f.projections) {
      if (projection.operation === '/api/fs/stat') {
        expect(JSON.parse(projection.body)).toEqual({ path: missingPath, exists: false, sourceKind: 'remote', sourceIdentity: sourceA });
      } else expect(projection.body).toBe('');
    }
    expect(f.counts()).toEqual({ missingStats: 2, missingReads: 1, localFallbackCalls: 0 });
    f.expectRemoteOnly();
  });

  for (const mode of ['missing-header', 'wrong-source', 'conflict']) {
    it(`keeps ${mode} refusals as failures in optional cache pre-stat and direct read`, async () => {
      const f = await fixture(mode);
      const failure = mode === 'missing-header'
        ? { status: 503, reason: 'invalid-response' }
        : { status: 409, reason: 'remote-source-changed' };
      await expect(f.cached.readFile(missingPath, { directory: root, optional: true })).rejects.toMatchObject(failure);
      expect(f.counts()).toEqual({ missingStats: 1, missingReads: 0, localFallbackCalls: 0 });
      await expect(f.files.readFile(missingPath, { directory: root, optional: true })).rejects.toMatchObject(failure);
      expect(f.counts()).toEqual({ missingStats: 1, missingReads: 1, localFallbackCalls: 0 });
      f.expectRemoteOnly();
    });
  }

  it('rejects an empty optional read when the current source changes before completion', async () => {
    const f = await fixture('replace-after-read');
    await expect(f.cached.readFile(missingPath, { directory: root, optional: true }))
      .rejects.toMatchObject({ status: 409, reason: 'remote-source-changed' });
    expect(f.counts()).toEqual({ missingStats: 1, missingReads: 1, localFallbackCalls: 0 });
    f.expectRemoteOnly();
  });
});
