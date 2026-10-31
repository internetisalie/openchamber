import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeUrlQuery, RuntimeUrlResolver } from '@openchamber/ui/lib/runtime-url';

const runtimeFetchMock = vi.fn();
const searchFilesMock = vi.fn();
let fileRuntimeKey = 'runtime-a';
const runtimeChanges = new Set<(detail: { runtimeKey: string; previousRuntimeKey: string }) => void>();
vi.mock('@openchamber/ui/lib/runtime-switch', async (original) => ({
  ...await original<typeof import('@openchamber/ui/lib/runtime-switch')>(),
  getRuntimeKey: () => fileRuntimeKey,
  subscribeRuntimeEndpointWillChange: (callback: (detail: { runtimeKey: string; previousRuntimeKey: string }) => void) => {
    runtimeChanges.add(callback);
    return () => runtimeChanges.delete(callback);
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  fileRuntimeKey = 'runtime-a';
  runtimeChanges.clear();
});

describe('remote workspace file responses', () => {
  const prepare = async () => {
    const { createWebFilesAPI, createWebWorkspaceFileSourceResolver } = await import('./files');
    let identity = 'workspace-live-a';
    let rootCalls = 0;
    let operation: (path: string, init: { query: URLSearchParams; signal?: AbortSignal }) => Response | Promise<Response> = () => new Response('', {
      headers: { 'X-OpenChamber-File-Source': identity },
    });
    runtimeFetchMock.mockReset();
    runtimeFetchMock.mockImplementation((path, init) => {
      if (path === '/api/fs/stat' && init.query.get('path') === '/repo') {
        rootCalls++;
        return Response.json({ path: '/repo', isFile: false, size: 4096, mtimeMs: 10,
          sourceKind: 'remote', sourceIdentity: identity });
      }
      return operation(path, init);
    });
    const resolveWorkspaceFileSource = createWebWorkspaceFileSourceResolver({ getDirectory: () => '/repo' });
    const indexed = vi.fn(async () => ({ files: [], sourceIdentity: identity }));
    const legacy = vi.fn(async () => []);
    const api = createWebFilesAPI({ getDirectory: () => '/repo', resolveWorkspaceFileSource,
      searchFilesWithSource: indexed, searchFiles: legacy });
    return { api, indexed, legacy, resolveWorkspaceFileSource, roots: () => rootCalls,
      replace: () => { identity = 'workspace-live-b'; },
      setIdentity: (value: string) => { identity = value; },
      respond: (handler: typeof operation) => { operation = handler; } };
  };

  it('enforces the same 1024 UTF8-byte identity bound in JSON, read headers and optional404 fences', async () => {
    for (const identity of ['a'.repeat(1024), 'é'.repeat(512)]) {
      const fixture = await prepare();
      fixture.setIdentity(identity);
      expect(await fixture.resolveWorkspaceFileSource('/repo')).toEqual({ kind: 'remote', sourceIdentity: identity });
      fixture.respond(() => new Response('', { headers: { 'X-OpenChamber-File-Source': identity } }));
      expect((await fixture.api.readFile!('/repo/a')).sourceIdentity).toBe(identity);
    }
    for (const identity of ['a'.repeat(1025), 'é'.repeat(512) + 'x']) {
      const fixture = await prepare();
      fixture.setIdentity(identity);
      await expect(fixture.resolveWorkspaceFileSource('/repo')).rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
      fixture.setIdentity('workspace-live-a');
      fixture.respond(() => new Response('', { headers: { 'X-OpenChamber-File-Source': identity } }));
      await expect(fixture.api.readFile!('/repo/a', { optional: true })).rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
      fixture.respond(() => Response.json({ error: 'Missing', reason: 'not-found' }, { status: 404,
        headers: { 'X-OpenChamber-File-Source': identity } }));
      await expect(fixture.api.readFile!('/repo/a', { optional: true })).rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
      fixture.respond(() => Response.json({ path: '/repo', entries: [], sourceIdentity: identity }));
      await expect(fixture.api.listDirectory('/repo')).rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
      fixture.respond(() => Response.json({ files: [], sourceIdentity: identity }));
      await expect(fixture.api.searchWithSource!({ directory: '/repo', query: 'x', includeHidden: true }))
        .rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
    }
  });

  it('uses the actual production constructor to classify via root stat, not a test-only mode flag', async () => {
    await prepare();
    const { createWebAPIs } = await import('./index');
    const api = createWebAPIs({ urls });
    expect(await api.files.resolveWorkspaceFileSource!('/repo')).toEqual({ kind: 'remote', sourceIdentity: 'workspace-live-a' });
    const result = await api.files.readFile!('/repo/empty', { directory: '/repo' });
    expect(result).toEqual({ path: '/repo/empty', content: '', sourceIdentity: 'workspace-live-a' });
    expect(runtimeFetchMock.mock.calls.some(([path, init]) => path === '/api/fs/stat' && init.query.get('path') === '/repo')).toBe(true);
  });

  it('classifies only the known local root-directory refusal, never auth/server/missing errors', async () => {
    const { createWebWorkspaceFileSourceResolver } = await import('./files');
    const resolve = createWebWorkspaceFileSourceResolver({ getDirectory: () => '/repo' });
    runtimeFetchMock.mockReset();
    runtimeFetchMock.mockResolvedValueOnce(Response.json({ sourceKind: 'local', error: 'Specified path is not a file' }, { status: 400 }));
    expect(await resolve('/repo')).toEqual({ kind: 'local' });
    for (const status of [401, 403, 404, 500]) {
      runtimeFetchMock.mockResolvedValueOnce(Response.json({ sourceKind: 'local', error: 'failure', reason: 'unknown' }, { status }));
      await expect(resolve('/repo')).rejects.toMatchObject({ status, reason: 'unknown' });
    }
    runtimeFetchMock.mockResolvedValueOnce(Response.json({ error: 'Unauthorized' }, { status: 401 }));
    await expect(resolve('/repo')).rejects.toMatchObject({ status: 401 });
    runtimeFetchMock.mockResolvedValueOnce(Response.json({ sourceKind: 'remote', error: 'not found while offline', reason: 'remote-unavailable' }, { status: 503 }));
    await expect(resolve('/repo')).rejects.toMatchObject({ status: 503, reason: 'remote-unavailable' });
    for (const payload of [
      { path: '/repo', isFile: false, size: 1 },
      { sourceKind: 'remote', path: '/repo', isFile: false, size: 1 },
      { sourceKind: 'other', sourceIdentity: 'a' },
    ]) {
      runtimeFetchMock.mockResolvedValueOnce(Response.json(payload));
      await expect(resolve('/repo')).rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
    }
  });

  it('keeps confirmed local optional/outside/fresh behavior after the known root-directory refusal', async () => {
    const { createWebFilesAPI, createWebWorkspaceFileSourceResolver } = await import('./files');
    runtimeFetchMock.mockReset();
    runtimeFetchMock.mockImplementation((path, init) => path === '/api/fs/stat'
      ? init.query.get('path') === '/repo'
        ? Response.json({ sourceKind: 'local', error: 'Specified path is not a file' }, { status: 400 })
        : Response.json({ sourceKind: 'local', error: 'missing file', reason: 'not-found' }, { status: 404 }) : new Response(''));
    const api = createWebFilesAPI({ getDirectory: () => '/repo',
      resolveWorkspaceFileSource: createWebWorkspaceFileSourceResolver({ getDirectory: () => '/repo' }) });
    expect(await api.readFile!('/outside/a', { directory: '/repo', optional: true, fresh: true, allowOutsideWorkspace: true }))
      .toEqual({ content: '', path: '/outside/a' });
    await expect(api.statFile!('/repo', { directory: '/repo' })).rejects.toMatchObject({ status: 400, reason: 'unknown' });
    await expect(api.statFile!('/outside/a', { directory: '/repo' })).rejects.toMatchObject({ status: 404, reason: 'not-found' });
  });

  it('preserves exact UTF8 read bytes and rejects missing, mismatching and replaced completed sources', async () => {
    const fixture = await prepare();
    const text = '\ufeffhello\r\n世界\n';
    fixture.respond(() => new Response(text, { headers: { 'X-OpenChamber-File-Source': 'workspace-live-a' } }));
    expect(await fixture.api.readFile!('/repo/a')).toEqual({ path: '/repo/a', content: text, sourceIdentity: 'workspace-live-a' });
    fixture.respond(() => new Response(''));
    await expect(fixture.api.readFile!('/repo/a', { optional: true })).rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
    fixture.respond(() => new Response('', { headers: { 'X-OpenChamber-File-Source': 'workspace-live-b' } }));
    await expect(fixture.api.readFile!('/repo/a')).rejects.toMatchObject({ status: 409, reason: 'remote-source-changed' });
    fixture.respond(() => { fixture.replace(); return new Response('', { headers: { 'X-OpenChamber-File-Source': 'workspace-live-a' } }); });
    await expect(fixture.api.readFile!('/repo/a')).rejects.toMatchObject({ status: 409, reason: 'remote-source-changed' });
  });

  it('preserves HTTP stat/read failures and only accepts fenced projected optional absence', async () => {
    const fixture = await prepare();
    for (const [status, reason] of [[404, 'not-found'], [409, 'remote-source-changed'], [503, 'remote-unavailable']] as const) {
      fixture.respond(() => Response.json({ error: 'File not found', reason }, { status,
        headers: status === 404 ? { 'X-OpenChamber-File-Source': 'workspace-live-a' } : {} }));
      await expect(fixture.api.readFile!('/repo/missing', { optional: true })).rejects.toMatchObject({ name: 'FilesystemError', status, reason });
      await expect(fixture.api.statFile!('/repo/missing', { optional: true })).rejects.toMatchObject({ name: 'FilesystemError', status, reason });
    }
    fixture.respond(() => Response.json({ error: 'Missing', reason: 'not-found' }, { status: 404 }));
    await expect(fixture.api.readFile!('/repo/missing', { optional: true })).rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
    fixture.respond(() => Response.json({ error: 'Missing', reason: 'not-found' }, { status: 404,
      headers: { 'X-OpenChamber-File-Source': 'workspace-live-b' } }));
    await expect(fixture.api.statFile!('/repo/missing', { optional: true })).rejects.toMatchObject({ status: 409, reason: 'remote-source-changed' });
    fixture.respond((path) => path === '/api/fs/stat'
      ? Response.json({ sourceKind: 'remote', sourceIdentity: 'workspace-live-a', path: '/repo/missing', exists: false },
        { headers: { 'X-OpenChamber-File-Source': 'workspace-live-a' } })
      : new Response('', { headers: { 'X-OpenChamber-File-Source': 'workspace-live-a' } }));
    expect(await fixture.api.statFile!('/repo/missing', { optional: true }))
      .toEqual({ path: '/repo/missing', isFile: false, exists: false, sourceIdentity: 'workspace-live-a' });
    expect((await fixture.api.readFile!('/repo/missing', { optional: true })).content).toBe('');
    fixture.respond(() => Response.json({ sourceKind: 'remote', sourceIdentity: 'workspace-live-a', path: '/repo/missing', exists: false }));
    await expect(fixture.api.statFile!('/repo/missing', { optional: true })).rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
    fixture.respond(() => Response.json({ sourceKind: 'remote', sourceIdentity: 'workspace-live-a', path: '/repo/a', isFile: true, size: 3 }));
    await expect(fixture.api.statFile!('/repo/a')).rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
  });

  it('validates empty list/search metadata and rejects partial, overcount and conflicting headers', async () => {
    const fixture = await prepare();
    fixture.respond(() => Response.json({ path: '/repo', entries: [], sourceIdentity: 'workspace-live-a' }));
    // List the workspace root while keeping root-stat classification separate.
    expect((await fixture.api.listDirectory('/repo')).sourceIdentity).toBe('workspace-live-a');
    fixture.respond(() => Response.json({ path: '/repo', entries: [] }));
    await expect(fixture.api.listDirectory('/repo')).rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
    fixture.respond(() => Response.json({ path: '/repo', sourceIdentity: 'workspace-live-a', entries: [{ name: 'a', path: '/repo/a', isDirectory: false }] }));
    await expect(fixture.api.listDirectory('/repo')).rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
    fixture.respond(() => Response.json({ path: '/repo', sourceIdentity: 'workspace-live-a', entries: Array.from({ length: 1001 }, () => ({ name: 'a', path: '/repo/a', isDirectory: false, isFile: true })) }));
    await expect(fixture.api.listDirectory('/repo')).rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
    fixture.respond(() => Response.json({ files: [], sourceIdentity: 'workspace-live-a' }, { headers: { 'X-OpenChamber-File-Source': 'workspace-live-b' } }));
    await expect(fixture.api.search({ directory: '/repo', query: 'x', includeHidden: true })).rejects.toMatchObject({ status: 409, reason: 'remote-source-changed' });
    fixture.respond(() => Response.json({ files: [{ path: '/outside/x', relativePath: 'x' }], sourceIdentity: 'workspace-live-a' }));
    await expect(fixture.api.search({ directory: '/repo', query: 'x', includeHidden: true })).rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
    fixture.respond(() => Response.json({ files: [{ path: '/repo/x', relativePath: 'x' }, { path: '/repo/y', relativePath: 'y' }], sourceIdentity: 'workspace-live-a' }));
    await expect(fixture.api.search({ directory: '/repo', query: 'x', includeHidden: true, maxResults: 1 })).rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
  });

  it('uses real source-aware index selection for default queries and only supplemental for remote toggles', async () => {
    const fixture = await prepare();
    expect(await fixture.api.searchWithSource!({ directory: '/repo', query: 'x' })).toEqual({ files: [], sourceIdentity: 'workspace-live-a' });
    expect(fixture.indexed).toHaveBeenCalledWith('x', expect.objectContaining({ directory: '/repo', type: 'file',
      expectedSourceIdentity: 'workspace-live-a', signal: expect.any(AbortSignal) }));
    expect(fixture.legacy).not.toHaveBeenCalled();
    fixture.respond(() => Response.json({ files: [], sourceIdentity: 'workspace-live-a' }));
    expect(await fixture.api.searchWithSource!({ directory: '/repo', query: 'x', includeHidden: true, respectGitignore: false, type: 'directory' }))
      .toEqual({ files: [], sourceIdentity: 'workspace-live-a' });
    expect(fixture.indexed).toHaveBeenCalledTimes(1);
    expect(runtimeFetchMock.mock.calls.find(([path]) => path === '/api/fs/search')?.[1].query)
      .toEqual(new URLSearchParams({ query: 'x', directory: '/repo', includeHidden: 'true', respectGitignore: 'false', type: 'directory' }));
    fixture.respond(() => Response.json({ files: [] }));
    await expect(fixture.api.searchWithSource!({ directory: '/repo', query: 'x', includeHidden: true }))
      .rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
    fixture.respond(() => Response.json({ error: 'offline', reason: 'remote-unavailable' }, { status: 503 }));
    await expect(fixture.api.search({ directory: '/repo', query: 'x', includeHidden: true }))
      .rejects.toMatchObject({ status: 503, reason: 'remote-unavailable' });
  });

  it('fences SDK empty completion and bridges actual SDK response status/kind', async () => {
    const fixture = await prepare();
    fixture.indexed.mockImplementationOnce(async () => { throw Object.assign(new Error('offline'), { status: 503, kind: 'remote-unavailable' }); });
    await expect(fixture.api.search({ directory: '/repo', query: 'x' })).rejects.toMatchObject({ name: 'FilesystemError', status: 503, reason: 'remote-unavailable' });
    fixture.indexed.mockImplementationOnce(async () => { fixture.replace(); return { files: [], sourceIdentity: 'workspace-live-a' }; });
    await expect(fixture.api.search({ directory: '/repo', query: 'x' })).rejects.toMatchObject({ status: 409, reason: 'remote-source-changed' });
  });

  it('bounds actual decoded response bodies without trusting Content-Length', async () => {
    const fixture = await prepare();
    fixture.respond(() => new Response('x'.repeat(1024 * 1024 + 1), { headers: { 'Content-Length': '1', 'X-OpenChamber-File-Source': 'workspace-live-a' } }));
    await expect(fixture.api.readFile!('/repo/a')).rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
    fixture.respond(() => new Response('{"files":[],"sourceIdentity":"workspace-live-a","padding":"' + 'x'.repeat(1024 * 1024) + '"}'));
    await expect(fixture.api.search({ directory: '/repo', query: 'x', includeHidden: true })).rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
    fixture.respond(() => new Response('x'.repeat(64 * 1024 + 1), { status: 409 }));
    await expect(fixture.api.readFile!('/repo/a')).rejects.toMatchObject({ status: 409, reason: 'invalid-response' });
    fixture.respond(() => new Response(new Uint8Array([255]), { headers: { 'X-OpenChamber-File-Source': 'workspace-live-a' } }));
    await expect(fixture.api.readFile!('/repo/a')).rejects.toMatchObject({ status: 503, reason: 'invalid-response' });
  });

  for (const cause of ['caller', 'runtime', 'deadline'] as const) it(`rejects incomplete read body on ${cause} without a stale result`, async () => {
    const fixture = await prepare();
    const controller = new AbortController();
    let started!: () => void;
    const bodyStarted = new Promise<void>((resolve) => { started = resolve; });
    let cancelled = 0;
    fixture.respond(() => new Response(new ReadableStream({
      start(stream) { stream.enqueue(new TextEncoder().encode('partial')); },
      pull() { started(); },
      cancel() { cancelled++; },
    }), { headers: { 'X-OpenChamber-File-Source': 'workspace-live-a' } }));
    if (cause === 'deadline') vi.useFakeTimers();
    try {
      const reading = fixture.api.readFile!('/repo/a', { signal: controller.signal });
      const rejected = expect(reading).rejects.toMatchObject(cause === 'caller' ? { name: 'AbortError' }
        : { status: cause === 'runtime' ? 409 : 503, reason: cause === 'runtime' ? 'remote-source-changed' : 'remote-unavailable' });
      await bodyStarted;
      if (cause === 'caller') controller.abort();
      else if (cause === 'runtime') {
        fileRuntimeKey = 'runtime-b';
        for (const callback of runtimeChanges) callback({ runtimeKey: 'runtime-b', previousRuntimeKey: 'runtime-a' });
      } else await vi.advanceTimersByTimeAsync(5_001);
      await rejected;
      expect(cancelled).toBe(1);
      expect(fixture.roots()).toBe(1);
    } finally { vi.useRealTimers(); }
  });
});

vi.mock('@openchamber/ui/lib/runtime-fetch', () => ({
  runtimeFetch: runtimeFetchMock,
}));

const toUrl = (path: string, query?: RuntimeUrlQuery): string => {
  const params = query instanceof URLSearchParams ? query : new URLSearchParams();
  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
};

const urls: RuntimeUrlResolver = {
  api: toUrl,
  authenticatedAsset: toUrl,
  assetWithUrlToken: (path: string, _token: string, query?: RuntimeUrlQuery) => toUrl(path, query),
  auth: toUrl,
  health: (query?: RuntimeUrlQuery) => toUrl('/health', query),
  rawFile: (path: string) => toUrl('/api/fs/raw', new URLSearchParams({ path })),
  sse: toUrl,
  websocket: toUrl,
};

describe('createWebFilesAPI', () => {
  it('sends a request for a path inside a space to that space, whichever folder is open', async () => {
    const { createWebFilesAPI } = await import('./files');
    let open = '/repo';
    const api = createWebFilesAPI({ urls, getDirectory: () => open });
    const directoryOfCall = (index: number) => runtimeFetchMock.mock.calls[index]?.[1]?.headers?.['x-opencode-directory'];
    runtimeFetchMock.mockReset();
    runtimeFetchMock.mockImplementation(async () => Response.json({ path: '/x', entries: [] }));

    // A draft waiting for a space stands on the project's folder and lists the space.
    await api.listDirectory('/spaces/a1b2c3d4e5f6/repo');
    await api.createDirectory('/spaces/a1b2c3d4e5f6/repo/src');
    // A host path keeps the open folder, and a space's own folder keeps itself.
    await api.listDirectory('/repo/src');
    open = '/spaces/a1b2c3d4e5f6/repo';
    await api.listDirectory('/spaces/a1b2c3d4e5f6/repo/src');

    expect([0, 1, 2, 3].map(directoryOfCall)).toEqual([
      '/spaces/a1b2c3d4e5f6', '/spaces/a1b2c3d4e5f6', '/repo', '/spaces/a1b2c3d4e5f6/repo',
    ]);
    runtimeFetchMock.mockReset();
  });

  it('preserves the directory permission failure contract', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/workspace' });
    runtimeFetchMock.mockResolvedValueOnce(Response.json(
      { error: 'Access to directory denied', reason: 'os-permission' },
      { status: 403 },
    ));

    const error = await api.listDirectory('/protected').catch((caught) => caught);

    expect(error).toMatchObject({
      name: 'FilesystemError',
      reason: 'os-permission',
      status: 403,
      message: 'Access to directory denied',
    });
  });

  it('rejects malformed successful directory listings', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/workspace' });
    runtimeFetchMock.mockResolvedValueOnce(Response.json({ path: '/workspace' }));

    await expect(api.listDirectory('/workspace')).rejects.toMatchObject({
      reason: 'invalid-response',
    });
  });

  it('forwards respectGitignore only when the caller asks for it', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/workspace' });

    runtimeFetchMock.mockResolvedValueOnce(Response.json({ path: '/workspace', entries: [] }));
    await api.listDirectory('/workspace', { respectGitignore: true });
    expect(runtimeFetchMock).toHaveBeenLastCalledWith('/api/fs/list', expect.objectContaining({
      query: new URLSearchParams({ path: '/workspace', respectGitignore: 'true' }),
    }));

    runtimeFetchMock.mockResolvedValueOnce(Response.json({ path: '/workspace', entries: [] }));
    await api.listDirectory('/workspace');
    expect(runtimeFetchMock).toHaveBeenLastCalledWith('/api/fs/list', expect.objectContaining({
      query: new URLSearchParams({ path: '/workspace' }),
    }));
  });

  it('uses per-call workspace directory for stat and read requests', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/stale-workspace' });

    runtimeFetchMock.mockResolvedValueOnce(Response.json({ path: '/worktree-b/file.txt', isFile: true, size: 12 }));
    await api.statFile?.('/worktree-b/file.txt', { directory: '/worktree-a' });

    expect(runtimeFetchMock).toHaveBeenLastCalledWith('/api/fs/stat', {
      query: new URLSearchParams({ path: '/worktree-b/file.txt' }),
      signal: expect.any(AbortSignal),
      headers: { 'x-opencode-directory': '/worktree-a' },
    });

    runtimeFetchMock.mockResolvedValueOnce(new Response('content'));
    await api.readFile?.('/worktree-b/file.txt', { directory: '/worktree-a' });

    expect(runtimeFetchMock).toHaveBeenLastCalledWith('/api/fs/read', {
      query: new URLSearchParams({ path: '/worktree-b/file.txt' }),
      signal: expect.any(AbortSignal),
      cache: 'default',
      headers: { 'x-opencode-directory': '/worktree-a' },
    });

    runtimeFetchMock.mockResolvedValueOnce(new Response('fresh content'));
    await api.readFile?.('/worktree-b/file.txt', { directory: '/worktree-a', fresh: true });

    expect(runtimeFetchMock).toHaveBeenLastCalledWith('/api/fs/read', {
      query: new URLSearchParams({ path: '/worktree-b/file.txt' }),
      cache: 'no-store',
      signal: expect.any(AbortSignal),
      headers: { 'x-opencode-directory': '/worktree-a' },
    });
  });

  it('sends the workspace directory header for downloads', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/current-workspace' });

    runtimeFetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(api.downloadFile?.('/current-workspace/file.txt')).rejects.toThrow('Download failed');

    expect(runtimeFetchMock).toHaveBeenLastCalledWith('/api/fs/raw', {
      query: new URLSearchParams({ path: '/current-workspace/file.txt', download: 'true' }),
      headers: { 'x-opencode-directory': '/current-workspace' },
    });
  });

  it('forwards allowOutsideWorkspace for a download of an outside file', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/workspace' });

    // The request is sent before the response is inspected, so a failed status
    // still proves the query the client built.
    runtimeFetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(api.downloadFile?.('/tmp/model.obj', { allowOutsideWorkspace: true, directory: '/workspace' }))
      .rejects.toThrow('Download failed');

    expect(runtimeFetchMock).toHaveBeenLastCalledWith('/api/fs/raw', {
      query: new URLSearchParams({ path: '/tmp/model.obj', download: 'true', allowOutsideWorkspace: 'true' }),
      headers: { 'x-opencode-directory': '/workspace' },
    });
  });

  it('reads an outside file directly without a grant', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/workspace' });
    const content = Array.from({ length: 100 }, (_, line) => `Line ${line + 1}`).join('\n');
    runtimeFetchMock.mockResolvedValueOnce(new Response(content));

    await expect(api.readFile?.('/tmp/plan.txt', { allowOutsideWorkspace: true }))
      .resolves.toEqual({ path: '/tmp/plan.txt', content });
    expect(runtimeFetchMock).toHaveBeenLastCalledWith('/api/fs/read', {
      query: new URLSearchParams({ path: '/tmp/plan.txt', allowOutsideWorkspace: 'true' }),
      cache: 'default',
      signal: expect.any(AbortSignal),
      headers: { 'x-opencode-directory': '/workspace' },
    });
  });

  it('rejects a stalled file read when its deadline expires', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/workspace' });
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    runtimeFetchMock.mockImplementationOnce((_path: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
    }));
    try {
      const pending = api.readFile?.('/tmp/plan.txt', { allowOutsideWorkspace: true });
      const rejected = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
      expect(timeout).toHaveBeenCalledWith(30_000);
      controller.abort(new DOMException('The operation timed out', 'TimeoutError'));
      await rejected;
    } finally {
      timeout.mockRestore();
    }
  });

  it('uploads binary file contents to the active workspace', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/workspace' });
    const file = new Blob([new Uint8Array([0, 1, 255])]);
    runtimeFetchMock.mockResolvedValueOnce(Response.json({ success: true, path: '/workspace/image.bin' }));

    await api.uploadFile?.('/workspace/image.bin', file, { directory: '/workspace' });

    expect(runtimeFetchMock).toHaveBeenLastCalledWith('/api/fs/upload', {
      method: 'POST',
      query: { path: '/workspace/image.bin', overwrite: undefined },
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-opencode-directory': '/workspace',
      },
      body: file,
    });
  });

  it('preserves upload conflict details for explicit overwrite handling', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/workspace' });
    runtimeFetchMock.mockResolvedValueOnce(Response.json(
      { error: 'File already exists', reason: 'already-exists' },
      { status: 409 },
    ));

    await expect(api.uploadFile?.('/workspace/file.txt', new Blob(['new']))).rejects.toMatchObject({
      reason: 'already-exists',
      status: 409,
    });
  });

  it('reports a rename onto an existing name as a conflict', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/workspace' });
    runtimeFetchMock.mockResolvedValueOnce(Response.json(
      { error: 'Destination already exists', reason: 'already-exists' },
      { status: 409 },
    ));

    await expect(api.rename?.('/workspace/src/a.ts', '/workspace/lib/a.ts')).rejects.toMatchObject({
      reason: 'already-exists',
      status: 409,
    });
  });

  it('opens the native share sheet for downloads in the Capacitor app', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/workspace' });
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('navigator', {});
    Object.defineProperty(window, 'Capacitor', { configurable: true, value: { isNativePlatform: () => true } });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    runtimeFetchMock.mockResolvedValueOnce(new Response('hello', { headers: { 'Content-Type': 'text/plain' } }));

    await api.downloadFile?.('/workspace/hello.txt');

    expect(share).toHaveBeenCalledWith({ files: [expect.objectContaining({ name: 'hello.txt', type: 'text/plain' })] });
  });

  it('hands downloads to the native FileShare plugin on Android, where WebView has no Web Share API', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/workspace' });
    const share = vi.fn().mockResolvedValue(undefined);
    const registerPlugin = vi.fn(() => ({ share }));
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('navigator', {});
    Object.defineProperty(window, 'Capacitor', {
      configurable: true,
      value: { isNativePlatform: () => true, getPlatform: () => 'android', registerPlugin },
    });
    runtimeFetchMock.mockResolvedValueOnce(new Response('hello', { headers: { 'Content-Type': 'text/plain' } }));

    await api.downloadFile?.('/workspace/hello.txt');

    expect(registerPlugin).toHaveBeenCalledWith('FileShare');
    expect(share).toHaveBeenCalledWith({ fileName: 'hello.txt', mimeType: 'text/plain', data: btoa('hello') });
  });

  it('delegates file search to file.find and maps hits', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/workspace', searchFiles: searchFilesMock });
    searchFilesMock.mockResolvedValueOnce([
      { name: 'package.json', path: '/workspace/package.json', relativePath: 'package.json' },
    ]);

    const results = await api.search({ directory: '/workspace', query: 'package', maxResults: 40 });

    expect(searchFilesMock).toHaveBeenCalledWith('package', {
      directory: '/workspace',
      limit: 40,
      type: 'file',
    });
    expect(results).toEqual([{ path: '/workspace/package.json', preview: ['package.json'] }]);
  });

  it('propagates search failures instead of returning empty', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/workspace', searchFiles: searchFilesMock });
    searchFilesMock.mockRejectedValueOnce(new Error('gone'));

    await expect(api.search({ directory: '/workspace', query: 'package' })).rejects.toThrow('gone');
    expect(searchFilesMock).toHaveBeenCalledWith('package', {
      directory: '/workspace',
      limit: undefined,
      type: 'file',
    });
  });

  it('requests toggle supplements in the requested workspace and parses paths', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ getDirectory: () => '/other', searchFiles: searchFilesMock });
    runtimeFetchMock.mockResolvedValueOnce(Response.json({ files: [
      { path: 'C:\\repo\\build\\ignored.ts', relativePath: 'build/ignored.ts' },
    ] }));

    expect(await api.search({ directory: 'C:/repo', query: 'ignored', maxResults: 25, includeHidden: true, respectGitignore: false }))
      .toEqual([{ path: 'C:/repo/build/ignored.ts', preview: ['build/ignored.ts'] }]);
    expect(runtimeFetchMock).toHaveBeenLastCalledWith('/api/fs/search', {
      query: new URLSearchParams({ query: 'ignored', directory: 'C:/repo', limit: '25', includeHidden: 'true', respectGitignore: 'false' }),
      headers: { 'x-opencode-directory': 'C:/repo' },
    });
    expect(searchFilesMock).not.toHaveBeenCalled();
  });

  it('rejects failed and malformed supplemental search responses', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({});
    const payload = { directory: '/repo', query: 'x', includeHidden: true };
    runtimeFetchMock.mockResolvedValueOnce(Response.json({ error: 'search failed' }, { status: 500 }));
    await expect(api.search(payload)).rejects.toThrow('search failed');
    runtimeFetchMock.mockResolvedValueOnce(Response.json({}));
    await expect(api.search(payload)).rejects.toMatchObject({ reason: 'invalid-response' });
  });
});

describe('createWebFilesAPI.searchContents', () => {
  const request = () => {
    const [url, init] = runtimeFetchMock.mock.calls.at(-1) ?? [];
    return { url, init };
  };

  it('sends the search as the server expects and parses the matches', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/elsewhere' });
    runtimeFetchMock.mockResolvedValueOnce(Response.json({
      matches: [{ path: 'C:\\repo\\src\\a.ts', relativePath: 'src/a.ts', line: 3, column: 7, text: 'const needle', ranges: [[6, 12]], cutStart: false }],
      stopped: 'limit',
    }));
    const abort = new AbortController();

    const outcome = await api.searchContents!({
      directory: '/repo', query: 'needle', regex: true, limit: 50, includeHidden: true, respectGitignore: false, signal: abort.signal,
    });

    const { url, init } = request();
    expect(url).toBe('/api/fs/find-in-files');
    expect(Object.fromEntries(init.query)).toEqual({ query: 'needle', regex: 'true', limit: '50', includeHidden: 'true', respectGitignore: 'false' });
    expect(init.headers).toEqual({ 'x-opencode-directory': '/repo' });
    expect(init.signal).toBe(abort.signal);
    expect(outcome).toEqual({
      status: 'ok',
      stopped: 'limit',
      matches: [{ path: 'C:/repo/src/a.ts', relativePath: 'src/a.ts', line: 3, column: 7, text: 'const needle', ranges: [[6, 12]], cutStart: false }],
    });
  });

  it('leaves default options out of the query', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/repo' });
    runtimeFetchMock.mockResolvedValueOnce(Response.json({ matches: [], stopped: null }));

    await api.searchContents!({ directory: '/repo', query: 'needle', regex: false });

    expect(Object.fromEntries(request().init.query)).toEqual({ query: 'needle', regex: 'false' });
  });

  it('turns the server’s unavailable and invalid-pattern answers into outcomes', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/repo' });

    runtimeFetchMock.mockResolvedValueOnce(Response.json({ error: 'no ripgrep', reason: 'search-unavailable' }, { status: 501 }));
    expect(await api.searchContents!({ directory: '/repo', query: 'x', regex: false })).toEqual({ status: 'unavailable' });

    runtimeFetchMock.mockResolvedValueOnce(Response.json({ error: 'unclosed group', reason: 'invalid-pattern' }, { status: 400 }));
    expect(await api.searchContents!({ directory: '/repo', query: '(', regex: true })).toEqual({ status: 'invalid-pattern', message: 'unclosed group' });
  });

  it('rejects other failures and malformed successes instead of answering no matches', async () => {
    const { createWebFilesAPI } = await import('./files');
    const api = createWebFilesAPI({ urls, getDirectory: () => '/repo' });

    runtimeFetchMock.mockResolvedValueOnce(Response.json({ error: 'ripgrep exited with code 2', reason: 'search-failed' }, { status: 500 }));
    await expect(api.searchContents!({ directory: '/repo', query: 'x', regex: false })).rejects.toMatchObject({ message: 'ripgrep exited with code 2', status: 500 });

    runtimeFetchMock.mockResolvedValueOnce(Response.json({ matches: [{ path: '/a' }] }));
    await expect(api.searchContents!({ directory: '/repo', query: 'x', regex: false })).rejects.toMatchObject({ reason: 'invalid-response' });
  });
});
