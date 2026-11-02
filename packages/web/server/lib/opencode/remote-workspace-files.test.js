import express from 'express';
import path from 'node:path';
import http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerFsRoutes } from '../fs/routes.js';
import { createRemoteWorkspaceFiles, remoteWorkspaceDirectorySelectors } from './remote-workspace-files.js';
import { registerRemoteWorkspaceFileRoutes } from './remote-workspace-file-routes.js';
import { createConfiguredRemoteWorkspaceFiles } from './remote-workspace-file-config.js';

const root = '/workspace';
const sourceIdentity = 'workspace-binding-fixture-1';
const remote = { mode: 'remote', workspaceID: 'workspace-1', directory: root };
const running = [];
afterEach(async () => {
  for (const server of running.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

const metadata = (data, extra = {}) => ({ location: { directory: root }, data, sourceIdentity, ...extra });
const refused = (status, kind, message = 'Provider refused the file request') => Response.json({
  _tag: ({ 400: 'InvalidRequestError', 404: 'FileNotFoundError', 409: 'ConflictError', 503: 'ServiceUnavailableError' })[status], kind, message,
}, { status });
const text = (body, extraHeaders = {}) => new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'X-OpenChamber-File-Source': sourceIdentity, ...extraHeaders } });

const fixture = async ({ directory = root, resolve = () => ({ ...remote, directory }), response = () => Response.json(metadata([], { location: { directory } })), local = false, configuredWorkspaces,
  rootResponse = () => Response.json(metadata({ path: '', exists: true, isFile: false, size: 4096, mtimeMs: 321 }, { location: { directory } })),
} = {}) => {
  const fetchUpstream = vi.fn(response);
  const fetchRoot = vi.fn(rootResponse);
  const authority = vi.fn(resolve);
  const createFiles = configuredWorkspaces === undefined ? createRemoteWorkspaceFiles : createConfiguredRemoteWorkspaceFiles;
  const files = createFiles({
    configuredWorkspaces,
    resolve: authority, fetchImpl: (url, options) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/api/fs/stat' && parsed.searchParams.get('path') === '') return fetchRoot(url, options);
      return fetchUpstream(url, options);
    },
    buildOpenCodeUrl: (route) => `http://provider.invalid${route}`,
    getOpenCodeAuthHeaders: () => ({ Authorization: 'Bearer reader-fixture' }),
  });
  const app = express();
  app.use(express.json());
  registerRemoteWorkspaceFileRoutes(app, { remoteWorkspaceFiles: files });
  const localGit = vi.fn((_req, res) => res.json({ local: true }));
  app.get('/api/git/status', localGit);
  const fsCalls = {
    realpath: vi.fn(async (value) => value),
    stat: vi.fn(async () => ({ isDirectory: () => true, isFile: () => true, size: 31, mtimeMs: 123 })),
    readdir: vi.fn(async () => [{ name: 'local-only.txt', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }]),
    readFile: vi.fn(async () => 'LOCAL CONTENT MUST NOT LEAK'),
  };
  const spawn = vi.fn(() => { throw new Error('Local execution must not run'); });
  const home = vi.fn(() => '/local-home');
  registerFsRoutes(app, {
    os: { homedir: home }, path, fsPromises: fsCalls, spawn,
    crypto: { randomUUID: () => 'fixture-id' }, openchamberUserConfigRoot: '/local-config',
    normalizeDirectoryPath: (value) => value,
    resolveProjectDirectory: vi.fn(async () => ({ directory: root, requestedDirectory: root })),
    resolveGitBinaryForSpawn: () => 'git', buildAugmentedPath: () => '',
  });
  app.get('/api/health', (_req, res) => res.json({ healthy: true }));
  const server = app.listen(0, '127.0.0.1');
  running.push(server);
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (route, options = {}) => {
    const headers = {};
    if (!local) headers['x-opencode-directory'] = root;
    Object.assign(headers, options.headers);
    return fetch(`${origin}${route}`, { ...options, headers });
  };
  const expectNoLocalAccess = () => {
    for (const call of Object.values(fsCalls)) expect(call).not.toHaveBeenCalled();
    expect(localGit).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(home).not.toHaveBeenCalled();
  };
  return { request, origin, fetchUpstream, fetchRoot, authority, fsCalls, localGit, expectNoLocalAccess };
};

describe('configured remote workspace file routing through Express', () => {
  it.each([
    { route: '/api/fs/list', payload: null },
    { route: '/api/fs/list', payload: [] },
    { route: '/api/fs/list', payload: metadata([], { location: { directory: 12 } }) },
    { route: '/api/fs/list', payload: metadata([], { sourceIdentity: 12 }) },
    { route: '/api/fs/list', payload: metadata({ path: 'a', type: 'file' }) },
    { route: '/api/fs/list', payload: metadata([{ path: 12, type: 'file' }]) },
    { route: '/api/fs/list', payload: metadata([{ path: 'a', type: 'symlink' }]) },
    { route: '/api/fs/find', payload: metadata([{ path: 'a', type: 'file', isSymbolicLink: true }]) },
    { route: '/api/fs/find', payload: metadata([{ path: 'a', type: 'file', name: 12 }]) },
    { route: '/api/fs/stat?path=%2Fworkspace%2Fa', payload: metadata({ path: 'a', exists: true, isFile: 'true', size: 1, mtimeMs: 2 }) },
    { route: '/api/fs/stat?path=%2Fworkspace%2Fa', payload: metadata({ path: 'a', exists: false, isFile: true, size: 1, mtimeMs: 2 }) },
    { route: '/api/fs/stat?path=%2Fworkspace%2Fa', payload: metadata({ path: 'a', exists: true, isFile: true, size: -1, mtimeMs: 2 }) },
    { route: '/api/fs/stat?path=%2Fworkspace%2Fa', payload: metadata({ path: 'a', exists: true, isFile: true, size: 1.5, mtimeMs: 2 }) },
    { route: '/api/fs/stat?path=%2Fworkspace%2Fa', payload: metadata({ path: 'a', exists: true, isFile: true, size: 9007199254740992, mtimeMs: 2 }) },
    { route: '/api/fs/stat?path=%2Fworkspace%2Fa', payload: metadata({ path: 'a', exists: true, isFile: true, size: 1, mtimeMs: '2' }) },
  ])('rejects malformed provider metadata without coercion or local fallthrough: %j', async ({ route, payload }) => {
    const f = await fixture({ response: () => Response.json(payload) });
    const response = await f.request(route);
    expect(response.status).toBe(503);
    const error = { error: 'Invalid remote file response', reason: 'invalid-response' };
    if (route.startsWith('/api/fs/stat')) error.sourceKind = 'remote';
    expect(await response.json()).toEqual(error);
    f.expectNoLocalAccess();
  });

  it('projects valid provider metadata without exposing unrelated fields or imposing a strict provider extension ban', async () => {
    const f = await fixture({ response: () => Response.json(metadata([{ path: 'a', type: 'file', providerExtension: true }], { providerExtension: true })) });
    const list = await f.request('/api/fs/list');
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ path: root, sourceIdentity, entries: [
      { name: 'a', path: '/workspace/a', isFile: true, isDirectory: false, isSymbolicLink: false },
    ] });
    f.expectNoLocalAccess();
  });

  it.each([null, { _tag: 'ServiceUnavailableError', kind: 'remote-unavailable', message: 12 },
    { _tag: 'FileNotFoundError', kind: 'remote-unavailable', message: 'refused' },
    { _tag: 'ServiceUnavailableError', kind: 'not-found', message: 'refused' },
  ])('rejects malformed structured provider errors without changing actual file state: %j', async (payload) => {
    const f = await fixture({ response: () => Response.json(payload, { status: 503 }) });
    const response = await f.request('/api/fs/read?path=%2Fworkspace%2Fa&optional=true');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Invalid remote file response', reason: 'invalid-response' });
    f.expectNoLocalAccess();
  });

  it.each(['x'.repeat(1024), 'é'.repeat(512)])('preserves a 1024 UTF-8 byte opaque identity across empty results, stat, read and scoped missing (%#)', async (token) => {
    const f = await fixture({
      rootResponse: () => Response.json(metadata({ path: '', exists: true, isFile: false, size: 4096, mtimeMs: 321 }, { sourceIdentity: token })),
      response: () => Response.json(metadata([], { sourceIdentity: token }), { headers: { 'X-OpenChamber-File-Source': token } }),
    });
    for (const route of ['/api/fs/list', '/api/fs/find', '/api/fs/stat']) {
      const response = await f.request(route);
      expect(response.status).toBe(200);
      expect((await response.json()).sourceIdentity).toBe(token);
    }
    f.fetchUpstream.mockImplementationOnce(() => text('', { 'X-OpenChamber-File-Source': token }));
    const read = await f.request('/api/fs/read?path=%2Fworkspace%2Fa');
    expect(read.status).toBe(200);
    expect(read.headers.get('X-OpenChamber-File-Source')).toBe(token);
    for (const operation of ['read', 'stat']) {
      f.fetchUpstream.mockImplementationOnce(() => {
        const response = refused(404, 'not-found');
        response.headers.set('X-OpenChamber-File-Source', token);
        return response;
      });
      const missing = await f.request(`/api/fs/${operation}?path=%2Fworkspace%2Fmissing&optional=true`);
      expect(missing.status).toBe(200);
      if (operation === 'read') expect(missing.headers.get('X-OpenChamber-File-Source')).toBe(token);
      else expect(await missing.json()).toMatchObject({ exists: false, sourceIdentity: token });
    }
    f.expectNoLocalAccess();
  });

  it.each(['x'.repeat(1025), `${'é'.repeat(512)}x`])('rejects a 1025 UTF-8 byte identity in root JSON and scoped 404 (%#)', async (token) => {
    const f = await fixture({ rootResponse: () => Response.json(metadata({ path: '', exists: true, isFile: false, size: 1, mtimeMs: 2 }, { sourceIdentity: token })) });
    const rootStat = await f.request('/api/fs/stat');
    expect(rootStat.status).toBe(503);
    expect((await rootStat.json()).reason).toBe('invalid-response');
    f.fetchRoot.mockImplementation(() => Response.json(metadata({ path: '', exists: true, isFile: false, size: 1, mtimeMs: 2 })));
    for (const route of ['/api/fs/list', '/api/fs/find']) {
      f.fetchUpstream.mockImplementationOnce(() => Response.json(metadata([], { sourceIdentity: token })));
      const response = await f.request(route);
      expect(response.status).toBe(503);
      expect((await response.json()).reason).toBe('invalid-response');
    }
    f.fetchUpstream.mockImplementationOnce(() => text('', { 'X-OpenChamber-File-Source': token }));
    const oversizedReadToken = await f.request('/api/fs/read?path=%2Fworkspace%2Fa');
    expect(oversizedReadToken.status).toBe(503);
    expect((await oversizedReadToken.json()).reason).toBe('invalid-response');
    f.fetchUpstream.mockImplementationOnce(() => {
      const response = refused(404, 'not-found');
      response.headers.set('X-OpenChamber-File-Source', token);
      return response;
    });
    const missing = await f.request('/api/fs/read?path=%2Fworkspace%2Fmissing&optional=true');
    expect(missing.status).toBe(503);
    expect((await missing.json()).reason).toBe('invalid-response');
    f.expectNoLocalAccess();
  });

  it('runs the production configuration factory through the real pre-local Express guard', async () => {
    const f = await fixture({ configuredWorkspaces: JSON.stringify([{ workspaceID: 'workspace-1', directory: root }]) });
    const response = await f.request('/api/fs/list', { headers: { 'x-opencode-directory': encodeURIComponent(root) } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ path: root, entries: [], sourceIdentity });
    f.expectNoLocalAccess();
  });

  it.each(['[]', 'invalid', '[{"workspaceID":"a","directory":"/workspace","url":"http://elsewhere"}]'])('keeps invalid present production configuration away from local handlers: %s', async (configuredWorkspaces) => {
    const f = await fixture({ configuredWorkspaces });
    const response = await f.request('/api/fs/list');
    expect(response.status).toBe(503);
    expect((await response.json()).reason).toBe('remote-unavailable');
    expect(f.fetchRoot).not.toHaveBeenCalled();
    expect(f.fetchUpstream).not.toHaveBeenCalled();
    f.expectNoLocalAccess();
  });

  it('delegates list before actual local fs handlers and projects only rooted validated entries', async () => {
    const f = await fixture({ response: () => Response.json(metadata([{ path: '.notes', type: 'file' }, { path: 'src', type: 'directory' }])) });
    const response = await f.request('/api/fs/list?path=%2Fworkspace');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ path: root, sourceIdentity, entries: [
      { name: '.notes', path: '/workspace/.notes', isFile: true, isDirectory: false, isSymbolicLink: false },
      { name: 'src', path: '/workspace/src', isFile: false, isDirectory: true, isSymbolicLink: false },
    ] });
    const [url, options] = f.fetchUpstream.mock.calls[0];
    expect(new URL(url).searchParams.get('path')).toBe('');
    expect(new URL(url).searchParams.get('location[directory]')).toBe(root);
    expect(new URL(url).searchParams.get('respectGitignore')).toBe('false');
    expect(options.headers.Authorization).toBe('Bearer reader-fixture');
    expect(options.redirect).toBe('error');
    f.expectNoLocalAccess();
  });

  it('preserves exact UTF-8 text, empty files and the independent source header without a JSON wrapper', async () => {
    const f = await fixture({ response: () => text('\uFEFFé\nline two\n') });
    const response = await f.request('/api/fs/read?path=%2Fworkspace%2Ffile%20name.txt');
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).toString('utf8')).toBe('\uFEFFé\nline two\n');
    expect(response.headers.get('x-openchamber-file-source')).toBe(sourceIdentity);
    expect(new URL(f.fetchUpstream.mock.calls[0][0]).pathname).toBe('/api/fs/read/file%20name.txt');
    f.fetchUpstream.mockImplementationOnce(() => text(''));
    const empty = await f.request('/api/fs/read?path=%2Fworkspace%2Fempty');
    expect(empty.status).toBe(200);
    expect(await empty.text()).toBe('');
    expect(empty.headers.get('x-openchamber-file-source')).toBe(sourceIdentity);
    f.expectNoLocalAccess();
  });

  it('decodes a wildcard once and never turns literal percent sequences into traversal', async () => {
    const f = await fixture({ response: () => text('literal filename') });
    const response = await f.request('/api/fs/read/%252e%252e/file');
    expect(response.status).toBe(200);
    expect(new URL(f.fetchUpstream.mock.calls[0][0]).pathname).toBe('/api/fs/read/%252e%252e/file');
    f.expectNoLocalAccess();
  });

  it.each([
    '/api/fs/read',
    '/api/fs/read?path=%2Foutside%2Ffile',
    '/api/fs/read?path=%2Fworkspace%2F..%2Foutside',
    '/api/fs/read?path=%2Fworkspace%2Fa&path=%2Fworkspace%2Fb',
    '/api/fs/read/a%2Fb',
    '/api/fs/read/a?path=%2Fworkspace%2Fb',
    '/api/fs/find?workspaceID=unregistered',
    '/api/fs/list?path=%2Fworkspace&directory=%2Fother',
    '/api/fs/find?location%5Bdirectory%5D=%2Fother',
    '/api/fs/find?location%5Bdirectory%5D=%2Fworkspace&location%5Bdirectory%5D=%2Fother',
  ])('refuses invalid or conflicting selectors without upstream or local access: %s', async (route) => {
    const f = await fixture();
    const response = await f.request(route);
    expect(response.status).toBe(400);
    expect((await response.json()).reason).toBe('invalid-path');
    expect(f.fetchUpstream).not.toHaveBeenCalled();
    expect(f.fetchRoot).not.toHaveBeenCalled();
    f.expectNoLocalAccess();
  });

  it('requires explicit scope and also honors explicitly marked URI header selectors', async () => {
    const f = await fixture();
    const missing = await f.request('/api/fs/find', { headers: { 'x-opencode-directory': '' } });
    expect(missing.status).toBe(400);
    const marked = await f.request('/api/fs/find', { headers: { 'x-opencode-directory': '%2Fworkspace', 'x-opencode-directory-encoding': 'uri' } });
    expect(marked.status).toBe(200);
    const malformed = await f.request('/api/fs/find', { headers: { 'x-opencode-directory': '%zz', 'x-opencode-directory-encoding': 'uri' } });
    expect(malformed.status).toBe(400);
    expect(f.fetchUpstream).toHaveBeenCalledTimes(1);
    f.expectNoLocalAccess();
  });

  it.each([
    { directory: '/workspace', header: encodeURIComponent('/workspace') },
    { directory: '/workspace', header: '/workspace' },
    { directory: '/workspace/資料 and spaces', header: encodeURIComponent('/workspace/資料 and spaces') },
    { directory: '/workspace/100%literal', header: '/workspace/100%literal' },
    { directory: '/workspace/%2e%2e', header: '/workspace/%2e%2e' },
    { directory: '/workspace/part%2Fname', header: '/workspace/part%2Fname' },
    { directory: '/workspace/%zz', header: '/workspace/%zz' },
  ])('accepts real consumer header forms through the same authority normalization: %j', async ({ directory, header }) => {
    const f = await fixture({ directory, resolve: (req) => {
      const selectors = remoteWorkspaceDirectorySelectors(req);
      return selectors[0] === directory ? { ...remote, directory } : undefined;
    } });
    const query = new URLSearchParams({ 'location[directory]': directory });
    const response = await f.request(`/api/fs/find?${query}`, { headers: { 'x-opencode-directory': header } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(metadata([], { location: { directory } }));
    expect(new URL(f.fetchRoot.mock.calls[0][0]).searchParams.get('location[directory]')).toBe(directory);
    expect(new URL(f.fetchUpstream.mock.calls[0][0]).searchParams.get('location[directory]')).toBe(directory);
    f.expectNoLocalAccess();
  });

  it.each([
    { 'x-opencode-directory': '%zz' },
    { 'x-opencode-directory': '%E0%A4%A' },
    { 'x-opencode-directory': '%252Fworkspace' },
    { 'x-opencode-directory': '%2Fworkspace%2F..%2Foutside' },
    { 'x-opencode-directory': '%2Fworkspace%00' },
    { 'x-opencode-directory': 'workspace' },
    { 'x-opencode-directory-encoding': 'base64' },
    { 'x-opencode-directory-encoding': '' },
    { 'x-opencode-directory': '', 'x-opencode-directory-encoding': 'uri' },
    { 'x-opencode-directory': '/workspace/%2e%2e', 'x-opencode-directory-encoding': 'uri' },
  ])('rejects malformed, relative, escaped or doubly encoded header selectors: %j', async (headers) => {
    const f = await fixture();
    const response = await f.request('/api/fs/find', { headers });
    expect(response.status).toBe(400);
    expect((await response.json()).reason).toBe('invalid-path');
    expect(f.fetchRoot).not.toHaveBeenCalled();
    expect(f.fetchUpstream).not.toHaveBeenCalled();
    f.expectNoLocalAccess();
  });

  it('rejects a decoded SDK header that conflicts with a query selector before authority lookup or provider access', async () => {
    const f = await fixture({ resolve: (req) => {
      const selectors = remoteWorkspaceDirectorySelectors(req);
      return selectors[0] === root ? remote : undefined;
    } });
    const response = await f.request('/api/fs/find?directory=%2Fother', { headers: { 'x-opencode-directory': encodeURIComponent(root) } });
    expect(response.status).toBe(400);
    expect(f.fetchRoot).not.toHaveBeenCalled();
    expect(f.fetchUpstream).not.toHaveBeenCalled();
    f.expectNoLocalAccess();
  });

  it.each([
    { 'x-opencode-directory': [root, root] },
    { 'x-opencode-directory': encodeURIComponent(root), 'x-opencode-directory-encoding': ['uri', 'uri'] },
  ])('rejects actual repeated directory/encoding headers even when their values agree: %j', async (headers) => {
    const f = await fixture();
    const response = await new Promise((resolve, reject) => {
      http.get(`${f.origin}/api/fs/find`, { headers }, (incoming) => {
        const chunks = [];
        incoming.on('data', (chunk) => chunks.push(chunk));
        incoming.on('end', () => resolve({ status: incoming.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
        incoming.on('error', reject);
      }).on('error', reject);
    });
    expect(response.status).toBe(400);
    expect(response.body.reason).toBe('invalid-path');
    expect(f.fetchRoot).not.toHaveBeenCalled();
    expect(f.fetchUpstream).not.toHaveBeenCalled();
    f.expectNoLocalAccess();
  });

  it.each(['/api/fs/list', '/api/fs/list?path=', '/api/fs/stat', '/api/fs/stat?path='])('uses only the already resolved registered root for omitted/empty list or stat path: %s', async (route) => {
    const f = await fixture();
    const response = await f.request(route);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.path).toBe(root);
    expect(result.sourceIdentity).toBe(sourceIdentity);
    expect(new URL(f.fetchRoot.mock.calls[0][0]).searchParams.get('path')).toBe('');
    if (route.startsWith('/api/fs/list')) {
      expect(result.entries).toEqual([]);
      expect(new URL(f.fetchUpstream.mock.calls[0][0]).searchParams.get('path')).toBe('');
    } else {
      expect(result).toMatchObject({ sourceKind: 'remote', isFile: false, isDirectory: true, size: 4096, mtimeMs: 321 });
      expect(f.fetchUpstream).not.toHaveBeenCalled();
    }
    f.expectNoLocalAccess();
  });

  it.each(['/api/fs/list', '/api/fs/stat'])('does not substitute a root when authority itself is missing: %s', async (route) => {
    const f = await fixture();
    const response = await f.request(route, { headers: { 'x-opencode-directory': '' } });
    expect(response.status).toBe(400);
    expect((await response.json()).reason).toBe('invalid-path');
    expect(f.fetchRoot).not.toHaveBeenCalled();
    expect(f.fetchUpstream).not.toHaveBeenCalled();
    f.expectNoLocalAccess();
  });

  it.each([
    ['GET', '/api/fs/home'], ['GET', '/api/git/status'], ['GET', '/api/fs/raw?path=%2Fworkspace%2Fa'],
    ['POST', '/api/fs/write'], ['POST', '/api/fs/upload'], ['POST', '/api/fs/exec'],
    ['POST', '/api/fs/directory-stats'], ['GET', '/api/fs/preview/token/image'],
    ['POST', '/api/openchamber/sessions/session-1/markdown-image-grants'], ['POST', '/api/openchamber/directory'],
    ['GET', '/api/fs/watch'], ['GET', '/API/FS/HOME'],
  ])('explicitly refuses excluded %s %s before local handlers', async (method, route) => {
    const f = await fixture();
    const response = await f.request(route, { method });
    expect(response.status).toBe(501);
    expect((await response.json()).reason).toBe('unsupported');
    expect(f.fetchUpstream).not.toHaveBeenCalled();
    f.expectNoLocalAccess();
  });

  it('keeps the existing remote content-search unavailable contract', async () => {
    const f = await fixture();
    const response = await f.request('/api/fs/find-in-files?query=needle');
    expect(response.status).toBe(501);
    expect((await response.json()).reason).toBe('search-unavailable');
    f.expectNoLocalAccess();
  });

  it('returns identity for empty searches and honors native versus supplemental type/toggles', async () => {
    const f = await fixture();
    const response = await f.request('/api/fs/search?query=src&type=directory&includeHidden=true&respectGitignore=false&limit=200');
    expect(await response.json()).toEqual({ files: [], sourceIdentity });
    const url = new URL(f.fetchUpstream.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/fs/find');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ type: 'directory', includeHidden: 'true', respectGitignore: 'false', limit: '100' });
    const native = await f.request('/api/fs/find?query=x');
    expect(await native.json()).toEqual(metadata([]));
    const nativeUrl = new URL(f.fetchUpstream.mock.calls[1][0]);
    expect(nativeUrl.searchParams.has('type')).toBe(false);
    expect(nativeUrl.searchParams.get('includeHidden')).toBe('false');
    expect(nativeUrl.searchParams.get('respectGitignore')).toBe('true');
    f.expectNoLocalAccess();
  });

  it('preserves the provider-ranked order instead of appending local hits or re-sorting paths', async () => {
    const f = await fixture({ response: () => Response.json(metadata([{ path: 'z/file', type: 'file' }, { path: 'a/file-old', type: 'file' }])) });
    const response = await f.request('/api/fs/search?query=file');
    expect((await response.json()).files.map((entry) => entry.relativePath)).toEqual(['z/file', 'a/file-old']);
    f.expectNoLocalAccess();
  });

  it.each([[400, 'dispatch-invalid'], [400, 'excluded-path'], [400, 'invalid-path'], [400, 'directory-limit'], [400, 'search-visit-limit'], [400, 'result-too-large'], [409, 'remote-source-changed'], [503, 'remote-unavailable']])('preserves actual refusal status %s and kind %s without empty-success fallback', async (status, kind) => {
    const f = await fixture({ response: () => refused(status, kind) });
    const response = await f.request('/api/fs/read?path=%2Fworkspace%2Fa&optional=true');
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: 'Provider refused the file request', reason: kind });
    expect(f.fetchUpstream).toHaveBeenCalledTimes(1);
    f.expectNoLocalAccess();
  });

  it('maps only a real structured 404 to the existing optional missing result', async () => {
    const f = await fixture({ response: () => {
      const response = refused(404, 'not-found');
      response.headers.set('X-OpenChamber-File-Source', sourceIdentity);
      return response;
    } });
    const response = await f.request('/api/fs/read?path=%2Fworkspace%2Fa&optional=true');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    const stat = await f.request('/api/fs/stat?path=%2Fworkspace%2Fa&optional=true');
    expect(stat.status).toBe(200);
    expect(stat.headers.get('X-OpenChamber-File-Source')).toBe(sourceIdentity);
    expect(await stat.json()).toEqual({ path: '/workspace/a', exists: false, sourceKind: 'remote', sourceIdentity });
    f.fetchUpstream.mockImplementationOnce(() => new Response('not a file response', { status: 404 }));
    const malformed = await f.request('/api/fs/read?path=%2Fworkspace%2Fa&optional=true');
    expect(malformed.status).toBe(503);
    f.expectNoLocalAccess();
  });

  it('passes scoped optional stat absence from the actual router into the actual WebFilesAPI', async () => {
    const { createWebFilesAPI, createWebWorkspaceFileSourceResolver } = await import('../../../src/api/files.ts');
    const f = await fixture({ response: () => {
      const response = refused(404, 'not-found');
      response.headers.set('X-OpenChamber-File-Source', sourceIdentity);
      return response;
    } });
    const dependencies = {
      fetch: (route, options) => f.request(`${route}?${new URLSearchParams(options.query)}`, {
        signal: options.signal, headers: options.headers,
      }),
      runtime: {
        getRuntimeKey: () => 'router-optional-stat-fixture',
        subscribeRuntimeEndpointWillChange: () => () => {},
      },
    };
    const resolveWorkspaceFileSource = createWebWorkspaceFileSourceResolver({ getDirectory: () => root, dependencies });
    const api = createWebFilesAPI({ getDirectory: () => root, resolveWorkspaceFileSource, dependencies });
    expect(await api.statFile('/workspace/missing', { optional: true })).toEqual({
      path: '/workspace/missing', isFile: false, exists: false, sourceIdentity,
    });
    expect(f.fetchUpstream).toHaveBeenCalledTimes(1);
    expect(f.fetchRoot.mock.calls.length).toBeGreaterThan(0);
    f.expectNoLocalAccess();
  });

  it.each([
    { status: 404, kind: 'not-found', token: undefined, expectedStatus: 404, expectedReason: 'not-found' },
    { status: 404, kind: 'not-found', token: 'replacement-binding', expectedStatus: 409, expectedReason: 'remote-source-changed' },
    { status: 409, kind: 'remote-source-changed', token: sourceIdentity, expectedStatus: 409, expectedReason: 'remote-source-changed' },
  ])('keeps optional stat refusal as an error without a success source header: %j', async ({ status, kind, token, expectedStatus, expectedReason }) => {
    const f = await fixture({ response: () => {
      const response = refused(status, kind);
      if (token !== undefined) response.headers.set('X-OpenChamber-File-Source', token);
      return response;
    } });
    const response = await f.request('/api/fs/stat?path=%2Fworkspace%2Fmissing&optional=true');
    expect(response.status).toBe(expectedStatus);
    expect(response.headers.get('X-OpenChamber-File-Source')).toBeNull();
    expect(await response.json()).toEqual({
      error: expectedReason === 'remote-source-changed' && status === 404
        ? 'Remote workspace source changed during the file request' : 'Provider refused the file request',
      reason: expectedReason, sourceKind: 'remote',
    });
    f.expectNoLocalAccess();
  });

  it('fences optional 404 against the source captured by root stat before the file fetch', async () => {
    const f = await fixture({ response: () => {
      const response = refused(404, 'not-found');
      response.headers.set('X-OpenChamber-File-Source', 'replacement-binding');
      return response;
    } });
    const changed = await f.request('/api/fs/read?path=%2Fworkspace%2Fmissing&optional=true');
    expect(changed.status).toBe(409);
    expect((await changed.json()).reason).toBe('remote-source-changed');
    f.fetchUpstream.mockImplementationOnce(() => refused(404, 'not-found'));
    const unscopedMissing = await f.request('/api/fs/read?path=%2Fworkspace%2Fmissing&optional=true');
    expect(unscopedMissing.status).toBe(404);
    expect((await unscopedMissing.json()).reason).toBe('not-found');
    expect(f.fetchRoot).toHaveBeenCalledTimes(2);
    f.expectNoLocalAccess();
  });

  it('does not mistake a root-resolution 404 for an optional missing file', async () => {
    const f = await fixture({ rootResponse: () => {
      const response = refused(404, 'not-found');
      response.headers.set('X-OpenChamber-File-Source', sourceIdentity);
      return response;
    } });
    const response = await f.request('/api/fs/read?path=%2Fworkspace%2Fa&optional=true');
    expect(response.status).toBe(404);
    expect(f.fetchUpstream).not.toHaveBeenCalled();
    f.expectNoLocalAccess();
  });

  it('uses native root stat metadata for remote classification without fabricating file metadata', async () => {
    const f = await fixture();
    const response = await f.request('/api/fs/stat?path=%2Fworkspace');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ path: root, isFile: false, isDirectory: true, size: 4096, mtimeMs: 321, sourceKind: 'remote', sourceIdentity });
    expect(f.fetchRoot).toHaveBeenCalledTimes(1);
    expect(f.fetchUpstream).not.toHaveBeenCalled();
    f.expectNoLocalAccess();
  });

  it('validates stat envelopes and stamps remote mode independently of provider mode fields', async () => {
    const f = await fixture({ response: () => Response.json(metadata({ path: 'a', exists: true, isFile: true, size: 17, mtimeMs: 789 }, { sourceKind: 'local' })) });
    const response = await f.request('/api/fs/stat?path=%2Fworkspace%2Fa');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ path: '/workspace/a', isFile: true, isDirectory: false, size: 17, mtimeMs: 789, sourceKind: 'remote', sourceIdentity });
    f.expectNoLocalAccess();
  });

  it('rejects absent remote identity without ever classifying that result as local', async () => {
    const f = await fixture({ rootResponse: () => Response.json(metadata({ path: '', exists: true, isFile: false, size: 1, mtimeMs: 2 }, { sourceIdentity: undefined })) });
    const response = await f.request('/api/fs/stat?path=%2Fworkspace');
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ sourceKind: 'remote', reason: 'invalid-response' });
    f.expectNoLocalAccess();
  });

  it('rejects changed successful read identity and inconsistent JSON/header identity', async () => {
    const f = await fixture({ response: () => text('replacement content', { 'X-OpenChamber-File-Source': 'replacement-binding' }) });
    const changed = await f.request('/api/fs/read?path=%2Fworkspace%2Fa');
    expect(changed.status).toBe(409);
    f.fetchUpstream.mockImplementationOnce(() => Response.json(metadata([]), { headers: { 'X-OpenChamber-File-Source': 'inconsistent-header' } }));
    const inconsistent = await f.request('/api/fs/find?query=a');
    expect(inconsistent.status).toBe(503);
    expect((await inconsistent.json()).reason).toBe('invalid-response');
    f.expectNoLocalAccess();
  });

  it.each([
    { data: [], sourceIdentity: undefined },
    { data: [], sourceIdentity: {} },
    { location: { directory: '/another-root' }, data: [] },
    { data: [{ path: '../outside', type: 'file' }] },
    { data: [{ path: '/workspace/a', type: 'file' }] },
    { data: [{ path: 'a', name: 'different', type: 'file' }] },
    { data: [{ path: 'a', type: 'symlink' }] },
    { data: [{ path: 'a', type: 'file', isSymbolicLink: true }] },
    { data: [{ path: 'a', type: 'file', isSymbolicLink: 'false' }] },
    { data: [{ path: 'nested/a', type: 'file' }] },
    { data: [{ path: 'a', type: 'file' }, { path: 'a', type: 'file' }] },
  ])('rejects malformed provider metadata without consulting C files: %j', async (extra) => {
    const f = await fixture({ response: () => Response.json(metadata([], extra)) });
    const response = await f.request('/api/fs/list?path=%2Fworkspace');
    expect(response.status).toBe(503);
    expect((await response.json()).reason).toBe('invalid-response');
    f.expectNoLocalAccess();
  });

  it('enforces the confirmed metadata, direct-entry and encoded UTF-8 byte bounds', async () => {
    const f = await fixture({ response: () => Response.json(metadata([], { padding: 'x'.repeat(1048576) })) });
    const largeMetadata = await f.request('/api/fs/list?path=%2Fworkspace');
    expect(largeMetadata.status).toBe(400);
    expect((await largeMetadata.json()).reason).toBe('result-too-large');
    f.fetchUpstream.mockImplementationOnce(() => Response.json(metadata(Array.from({ length: 1001 }, (_, index) => ({ path: `f${index}`, type: 'file' })))));
    expect((await f.request('/api/fs/list?path=%2Fworkspace')).status).toBe(400);
    f.fetchUpstream.mockImplementationOnce(() => text('é'.repeat(524288)));
    const exact = await f.request('/api/fs/read?path=%2Fworkspace%2Fa');
    expect(exact.status).toBe(200);
    expect(Buffer.byteLength(await exact.text(), 'utf8')).toBe(1048576);
    f.fetchUpstream.mockImplementationOnce(() => text('é'.repeat(524289)));
    const overflow = await f.request('/api/fs/read?path=%2Fworkspace%2Fa');
    expect(overflow.status).toBe(400);
    expect((await overflow.json()).reason).toBe('file-too-large');
    f.expectNoLocalAccess();
  });

  it('bounds actual post-fetch entity bytes, not compressed wire-length headers, at the exact read boundary', async () => {
    let pulls = 0;
    const body = new ReadableStream({
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(1048576).fill(120));
        controller.close();
      },
    }, { highWaterMark: 0 });
    const f = await fixture({ response: () => text(body, { 'Content-Encoding': 'gzip', 'Content-Length': '1048608' }) });
    const response = await f.request('/api/fs/read?path=%2Fworkspace%2Fboundary');
    expect(response.status).toBe(200);
    expect(Buffer.byteLength(await response.text(), 'utf8')).toBe(1048576);
    expect(pulls).toBe(1);
    f.expectNoLocalAccess();
  });

  it('cancels on oversized actual bytes despite a small declared length without pulling another chunk', async () => {
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(1048577).fill(120)); },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const f = await fixture({ response: () => text(body, { 'Content-Encoding': 'gzip', 'Content-Length': '1' }) });
    const response = await f.request('/api/fs/read?path=%2Fworkspace%2Foversized');
    expect(response.status).toBe(400);
    expect((await response.json()).reason).toBe('file-too-large');
    expect(pulls).toBe(1);
    expect(cancelled).toBe(true);
    f.expectNoLocalAccess();
  });

  it('uses actual decoded-body limits for metadata and structured errors with compression headers too', async () => {
    const base = JSON.stringify(metadata([], { padding: '' }));
    const metadataBody = JSON.stringify(metadata([], { padding: 'x'.repeat(1048576 - Buffer.byteLength(base, 'utf8')) }));
    const f = await fixture({ response: () => new Response(metadataBody, {
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Content-Length': '1048608' },
    }) });
    const response = await f.request('/api/fs/list?path=%2Fworkspace');
    expect(Buffer.byteLength(metadataBody, 'utf8')).toBe(1048576);
    expect(response.status).toBe(200);
    expect((await response.json()).entries).toEqual([]);
    const errorBase = { _tag: 'ServiceUnavailableError', kind: 'remote-unavailable', message: '' };
    const errorBody = JSON.stringify({ ...errorBase, message: 'x'.repeat(65536 - Buffer.byteLength(JSON.stringify(errorBase), 'utf8')) });
    f.fetchUpstream.mockImplementationOnce(() => new Response(errorBody, {
      status: 503, headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Content-Length': '65568' },
    }));
    const refusedRead = await f.request('/api/fs/read?path=%2Fworkspace%2Fa');
    expect(Buffer.byteLength(errorBody, 'utf8')).toBe(65536);
    expect(refusedRead.status).toBe(503);
    expect((await refusedRead.json()).reason).toBe('remote-unavailable');
    f.expectNoLocalAccess();
  });

  it('bounds stalled upstream body transfer and cancels it without invoking local fallback', async () => {
    let cancelled = false;
    const f = await fixture({ response: () => text(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('partial')); },
      cancel() { cancelled = true; },
    })) });
    const response = await f.request('/api/fs/read?path=%2Fworkspace%2Fa');
    expect(response.status).toBe(503);
    expect((await response.json()).reason).toBe('remote-unavailable');
    expect(f.fetchUpstream.mock.calls[0][1].signal.aborted).toBe(true);
    expect(cancelled).toBe(true);
    f.expectNoLocalAccess();
  }, 10000);

  it('propagates an actual client disconnect through the upstream operation signal', async () => {
    let started;
    let aborted;
    const reachedProvider = new Promise((resolve) => { started = resolve; });
    const providerAborted = new Promise((resolve) => { aborted = resolve; });
    const f = await fixture({ response: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => { aborted(); reject(new Error('provider request aborted')); }, { once: true });
      started();
    }) });
    const controller = new AbortController();
    const request = f.request('/api/fs/read?path=%2Fworkspace%2Fa', { signal: controller.signal });
    const rejection = expect(request).rejects.toThrow();
    await reachedProvider;
    controller.abort();
    await rejection;
    await providerAborted;
    expect(f.fetchUpstream.mock.calls[0][1].signal.aborted).toBe(true);
    f.expectNoLocalAccess();
  });

  it('retains an actual unmodelled refusal status without trying to decode it as file data', async () => {
    const f = await fixture({ response: () => new Response('not-json-and-not-file-content', { status: 403, headers: { 'content-type': 'application/json' } }) });
    const response = await f.request('/api/fs/read?path=%2Fworkspace%2Fa&optional=true');
    expect(response.status).toBe(403);
    expect((await response.json()).reason).toBe('remote-unavailable');
    f.expectNoLocalAccess();
  });

  it('preserves local fs behavior and health routing when authority explicitly resolves local', async () => {
    const f = await fixture({ resolve: () => ({ mode: 'local' }), local: true });
    const response = await f.request('/api/fs/list');
    expect(response.status).toBe(200);
    expect((await response.json()).path).toBe('/local-home');
    expect(f.fetchUpstream).not.toHaveBeenCalled();
    expect((await (await f.request('/api/health')).json()).healthy).toBe(true);
  });

  it('leaves the actual local list route logical-path and symlink behavior intact', async () => {
    const f = await fixture({ resolve: () => ({ mode: 'local' }), local: true });
    f.fsCalls.realpath.mockImplementation(async (value) => value === '/workspace-alias' ? '/physical-root' : value);
    f.fsCalls.readdir.mockResolvedValueOnce([{ name: 'linked-directory', isDirectory: () => false, isFile: () => false, isSymbolicLink: () => true }]);
    const response = await f.request('/api/fs/list?path=%2Fworkspace-alias');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ path: '/workspace-alias', entries: [
      { name: 'linked-directory', path: '/workspace-alias/linked-directory', isDirectory: true, isFile: false, isSymbolicLink: true },
    ] });
    expect(f.fetchRoot).not.toHaveBeenCalled();
    expect(f.fetchUpstream).not.toHaveBeenCalled();
  });

  it('stamps local stat success and errors without changing their existing status or metadata', async () => {
    const f = await fixture({ resolve: () => ({ mode: 'local' }), local: true });
    const file = await f.request('/api/fs/stat?path=%2Fworkspace%2Fa');
    expect(file.status).toBe(200);
    expect(await file.json()).toEqual({ path: '/workspace/a', isFile: true, size: 31, mtimeMs: 123, sourceKind: 'local' });
    f.fsCalls.stat.mockImplementationOnce(async () => ({ isFile: () => false, isDirectory: () => true }));
    const directory = await f.request('/api/fs/stat?path=%2Fworkspace');
    expect(directory.status).toBe(400);
    expect(await directory.json()).toEqual({ error: 'Specified path is not a file', sourceKind: 'local' });
    const noPath = await f.request('/api/fs/stat');
    expect(noPath.status).toBe(400);
    expect(await noPath.json()).toEqual({ error: 'Path is required', sourceKind: 'local' });
    expect(f.fetchRoot).not.toHaveBeenCalled();
    expect(f.fetchUpstream).not.toHaveBeenCalled();
  });

  it('treats unresolved remote authority as a refusal, never implicit local mode', async () => {
    const f = await fixture({ resolve: () => undefined });
    const response = await f.request('/api/fs/list?path=%2Fworkspace');
    expect(response.status).toBe(503);
    expect(f.fetchUpstream).not.toHaveBeenCalled();
    f.expectNoLocalAccess();
  });
});
