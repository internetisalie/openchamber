import { describe, expect, it, vi } from 'vitest';
import { createWebFilesAPI, type WebFileDependencies } from './files';
import { FilesystemError } from '@openchamber/ui/lib/api/files-errors';

const directory = '/work/container';
const identity = 'native-fixture-source';
const fixture = (response: () => Response) => {
  const fetch = vi.fn<NonNullable<WebFileDependencies['fetch']>>(async () => response());
  const resolveWorkspaceFileSource = vi.fn(async () => ({ kind: 'remote' as const, sourceIdentity: identity }));
  const files = createWebFilesAPI({ getDirectory: () => '/other/open-directory', resolveWorkspaceFileSource,
    dependencies: { fetch, runtime: { getRuntimeKey: () => 'native-test', subscribeRuntimeEndpointWillChange: () => () => {} } } });
  if (!files.readNativeFile) throw new Error('Native read operation missing');
  return { read: files.readNativeFile, fetch, resolveWorkspaceFileSource };
};

describe('native relative file read adapter', () => {
  it('bounds projection text at 16 KiB while preserving native source checks and dispatch refusals', async () => {
    const path = '.supervisor/dispatch-session-projection/ses_one.json';
    const oversized = fixture(() => new Response('x'.repeat(16385), { headers: { 'X-OpenChamber-File-Source': identity } }));
    await expect(oversized.read(path, { directory, maxBytes: 16384 })).rejects.toMatchObject({ reason: 'invalid-response' });
    for (const reason of ['dispatch-invalid', 'excluded-path']) {
      const refusal = fixture(() => Response.json({ reason, error: 'Refused' }, { status: 400 }));
      await expect(refusal.read(path, { directory, maxBytes: 16384 })).rejects.toMatchObject({ reason, status: 400 });
    }
    const bounded = fixture(() => new Response('{}', { headers: { 'X-OpenChamber-File-Source': identity } }));
    await bounded.read(path, { directory, maxBytes: 16384 });
    expect(bounded.fetch.mock.calls[0][0]).toBe('/api/fs/read/.supervisor/dispatch-session-projection/ses_one.json');
    expect(bounded.fetch.mock.calls[0][1]).toMatchObject({ headers: { 'x-opencode-directory': directory }, cache: 'no-store' });
    for (const maxBytes of [0, -1, 1.5, 1048577]) {
      await expect(bounded.read(path, { directory, maxBytes })).rejects.toMatchObject({ reason: 'invalid-path' });
    }
    expect(bounded.fetch).toHaveBeenCalledTimes(1);
  });
  it('uses the existing per-segment route and selected container, with text response and no optional query', async () => {
    const f = fixture(() => new Response('{"version":1}', { headers: { 'X-OpenChamber-File-Source': identity } }));
    expect(await f.read('.supervisor/manifest.json', { directory })).toEqual({ status: 'read', content: '{"version":1}' });
    expect(f.fetch.mock.calls[0][0]).toBe('/api/fs/read/.supervisor/manifest.json');
    expect(f.fetch.mock.calls[0][1]).toMatchObject({ headers: { 'x-opencode-directory': '/work/container' }, cache: 'no-store' });
    expect(f.fetch.mock.calls[0][1]).not.toHaveProperty('query');
    expect(f.resolveWorkspaceFileSource.mock.calls).toHaveLength(2);
    const encoded = fixture(() => new Response('text', { headers: { 'X-OpenChamber-File-Source': identity } }));
    await encoded.read('folder/file name.json', { directory });
    expect(encoded.fetch.mock.calls[0][0]).toBe('/api/fs/read/folder/file%20name.json');
  });

  it('accepts only identity-checked not-found as absence', async () => {
    const missing = fixture(() => Response.json({ reason: 'not-found', error: 'Absent' }, {
      status: 404, headers: { 'X-OpenChamber-File-Source': identity },
    }));
    expect(await missing.read('.supervisor/manifest.json', { directory })).toEqual({ status: 'missing' });
    for (const status of [401, 403, 500]) {
      const failure = fixture(() => Response.json({ error: 'Unavailable', reason: 'remote-unavailable' }, { status }));
      await expect(failure.read('.supervisor/manifest.json', { directory })).rejects.toThrow();
    }
    const unscoped = fixture(() => Response.json({ reason: 'not-found' }, { status: 404 }));
    await expect(unscoped.read('.supervisor/manifest.json', { directory })).rejects.toThrow();
    const changed = fixture(() => new Response('{}', { headers: { 'X-OpenChamber-File-Source': 'different-source' } }));
    await expect(changed.read('.supervisor/manifest.json', { directory })).rejects.toThrow();
    const rootLost = fixture(() => Response.json({ reason: 'not-found' }, {
      status: 404, headers: { 'X-OpenChamber-File-Source': identity },
    }));
    rootLost.resolveWorkspaceFileSource.mockResolvedValueOnce({ kind: 'remote', sourceIdentity: identity })
      .mockRejectedValueOnce(new FilesystemError('Container lost', { status: 404, reason: 'not-found' }));
    await expect(rootLost.read('.supervisor/manifest.json', { directory })).rejects.toThrow('Container lost');
  });

  it('rejects invalid relative paths without transport and does not fall back to local files', async () => {
    const f = fixture(() => new Response('unused'));
    for (const path of ['../manifest.json', '/manifest.json', 'a//b', 'a\\b', 'a/./b']) {
      await expect(f.read(path, { directory })).rejects.toThrow();
    }
    expect(f.fetch).not.toHaveBeenCalled();
    const local = createWebFilesAPI({ dependencies: { fetch: f.fetch }, resolveWorkspaceFileSource: async () => ({ kind: 'local' }) });
    expect(await local.readNativeFile?.('.supervisor/manifest.json', { directory })).toEqual({ status: 'unsupported' });
    expect(f.fetch).not.toHaveBeenCalled();
  });
});
