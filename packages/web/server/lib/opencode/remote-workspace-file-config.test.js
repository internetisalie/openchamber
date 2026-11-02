import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createConfiguredRemoteWorkspaceFiles } from './remote-workspace-file-config.js';

const mapping = JSON.stringify([{ workspaceID: 'workspace-1', directory: '/workspace' }]);
const request = (header = encodeURIComponent('/workspace'), query = '') => ({
  originalUrl: `/api/fs/find${query}`, headers: { 'x-opencode-directory': header },
  get: (name) => name === 'x-opencode-directory' ? header : undefined,
});
const fixture = (configuredWorkspaces) => {
  const fetchImpl = vi.fn();
  return {
    fetchImpl,
    files: createConfiguredRemoteWorkspaceFiles({
      configuredWorkspaces, fetchImpl,
      buildOpenCodeUrl: (route) => `http://provider.invalid${route}`,
      getOpenCodeAuthHeaders: () => ({ Authorization: 'Bearer fixture' }),
    }),
  };
};

describe('read-once remote workspace configuration', () => {
  it('leaves absent configuration local without constructing a delegate', () => {
    expect(fixture(undefined).files).toBeUndefined();
  });

  it.each(['', '[]', 'null', '{}', 'invalid', '[null]', '[[]]',
    '[{"workspaceID":12,"directory":"/workspace"}]', '[{"workspaceID":"a","directory":12}]',
    '[{"workspaceID":null,"directory":"/workspace"}]', '[{"workspaceID":"a","directory":null}]',
    '[{"workspaceID":"a"}]', '[{"directory":"/workspace"}]',
    '[{"workspaceID":" ","directory":"/workspace"}]',
    '[{"workspaceID":"a","directory":"relative"}]',
    '[{"workspaceID":"a","directory":"/workspace/../other"}]',
    '[{"workspaceID":"a","directory":"/workspace","url":"http://other"}]',
    '[{"workspaceID":"a","directory":"/workspace","secret":"x"}]',
    '[{"workspaceID":"a","directory":"/one"},{"workspaceID":"a","directory":"/two"}]',
    '[{"workspaceID":"a","directory":"/one"},{"workspaceID":"b","directory":"/one/"}]',
  ])('refuses invalid present configuration without upstream access: %s', async (raw) => {
    const f = fixture(raw);
    await expect(f.files.resolve(request())).rejects.toMatchObject({ status: 503, kind: 'remote-unavailable' });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it.each([null, 12, false, { workspaceID: 'a', directory: '/workspace' }])('refuses non-string present configuration without coercion: %j', async (raw) => {
    const f = fixture(raw);
    await expect(f.files.resolve(request())).rejects.toMatchObject({ status: 503, kind: 'remote-unavailable' });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['/workspace', encodeURIComponent('/workspace')])('resolves actual plain/SDK selectors through the configured map: %s', async (header) => {
    const f = fixture(mapping);
    await expect(f.files.resolve(request(header, '?directory=%2Fworkspace'))).resolves.toEqual({ mode: 'remote', workspaceID: 'workspace-1', directory: '/workspace' });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    { originalUrl: '/api/fs/list', headers: {} },
    request('/unknown'), request('/workspace', '?directory=%2Funknown'),
    request('/workspace', '?directory=%2Fworkspace&directory=%2Fworkspace'),
    request('%252Fworkspace'),
    { ...request(), rawHeaders: ['x-opencode-directory', '%2Fworkspace', 'X-OpenCode-Directory', '%2Fworkspace'] },
  ])('refuses unresolved or ambiguous authority before provider access: %j', async (req) => {
    const f = fixture(mapping);
    await expect(f.files.resolve(req)).rejects.toMatchObject({ status: 400, kind: 'invalid-path' });
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });

  it('retains a parsed mapping and refuses roots not in that snapshot', async () => {
    const f = fixture(mapping);
    await expect(f.files.resolve(request('/workspace'))).resolves.toMatchObject({ workspaceID: 'workspace-1' });
    await expect(f.files.resolve(request('/other'))).rejects.toMatchObject({ status: 400 });
  });

  it('keeps the production index caller wired to existing upstream/auth and the early guard', async () => {
    const index = await readFile(new URL('../../index.js', import.meta.url), 'utf8');
    expect(index).toMatch(/remoteWorkspaceFiles: createConfiguredRemoteWorkspaceFiles\(\{\s*configuredWorkspaces: process\.env\.OPENCHAMBER_REMOTE_WORKSPACES,\s*buildOpenCodeUrl,\s*getOpenCodeAuthHeaders,/);
    const runtime = await readFile(new URL('./feature-routes-runtime.js', import.meta.url), 'utf8');
    expect(runtime.indexOf('registerRemoteWorkspaceFileRoutes(app,')).toBeGreaterThan(-1);
    expect(runtime.indexOf('registerRemoteWorkspaceFileRoutes(app,')).toBeLessThan(runtime.indexOf('registerGitRoutes(app,'));
    expect(runtime.indexOf('registerRemoteWorkspaceFileRoutes(app,')).toBeLessThan(runtime.indexOf('registerFsRoutes(app,'));
  });
});
