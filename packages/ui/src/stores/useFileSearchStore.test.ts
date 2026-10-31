import { beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import assert from 'node:assert/strict';
import type { FileSearchOutcome, FileSearchQuery, WorkspaceFileSource } from '@/lib/api/types';
import { FilesystemError } from '@/lib/api/files-errors';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

const searchRequests: Array<Deferred<Array<{ path: string }>>> = [];
let runtimeKey = 'runtime-a';
let runtimeSearch: (() => Promise<Array<{ path: string; preview: string[] }>>) | undefined;
const runtimeSearchCalls: unknown[] = [];
let runtimeSource: (() => Promise<WorkspaceFileSource>) | undefined;
let runtimeSourceSearch: ((query: FileSearchQuery) => Promise<FileSearchOutcome>) | undefined;

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const searchFilesMock = mock(() => {
  const request = createDeferred<Array<{ path: string }>>();
  searchRequests.push(request);
  return request.promise;
});

mock.module('@/lib/opencode/client', () => ({
  opencodeClient: {
    searchFiles: searchFilesMock,
  },
}));
mock.module('@/lib/runtime-switch', () => ({ getRuntimeKey: () => runtimeKey }));
mock.module('@/contexts/runtimeAPIRegistry', () => ({
  getRegisteredRuntimeAPIs: () => {
    const search = runtimeSearch;
    return search || runtimeSource || runtimeSourceSearch ? { files: { resolveWorkspaceFileSource: runtimeSource,
      searchWithSource: runtimeSourceSearch, search: (payload: unknown) => {
      runtimeSearchCalls.push(payload);
      return search ? search() : Promise.resolve([]);
    } } } : undefined;
  },
}));

const { useFileSearchStore } = await import('./useFileSearchStore');

describe('useFileSearchStore', () => {
  beforeEach(() => {
    searchRequests.length = 0;
    runtimeKey = 'runtime-a';
    runtimeSearch = undefined;
    runtimeSource = undefined;
    runtimeSourceSearch = undefined;
    runtimeSearchCalls.length = 0;
    useFileSearchStore.setState({
      cache: {},
      cacheKeys: [],
      inFlight: {},
    });
  });

  test('keeps indexed results and appends deduplicated toggle results', async () => {
    runtimeSearch = mock(async () => [
      { path: '/project/ordinary.ts', preview: ['ordinary.ts'] },
      { path: '/project/build/ignored.ts', preview: ['build/ignored.ts'] },
    ]);
    const pending = useFileSearchStore.getState().searchFiles('/project', 'ts', 3, { respectGitignore: false });
    const indexed = { path: '/project/ordinary.ts', name: 'ordinary.ts', relativePath: 'ordinary.ts' };
    searchRequests[0].resolve([indexed]);

    expect(await pending).toEqual([
      indexed,
      { path: '/project/build/ignored.ts', name: 'ignored.ts', relativePath: 'build/ignored.ts', extension: 'ts' },
    ]);
    expect(runtimeSearchCalls).toEqual([{
      directory: '/project', query: 'ts', maxResults: 3, includeHidden: false, respectGitignore: false,
    }]);
  });

  test('keeps toggle caches separate and leaves directory searches on OpenCode', async () => {
    runtimeSearch = mock(async () => [{ path: '/project/.hidden.ts', preview: ['.hidden.ts'] }]);
    const hidden = useFileSearchStore.getState().searchFiles('/project', 'hidden', 60, { includeHidden: true });
    searchRequests[0].resolve([]);
    expect(await hidden).toHaveLength(1);

    const ordinary = useFileSearchStore.getState().searchFiles('/project', 'hidden');
    searchRequests[1].resolve([]);
    expect(await ordinary).toEqual([]);
    const directories = useFileSearchStore.getState().searchFiles('/project', 'hidden', 60, { includeHidden: true, type: 'directory' });
    searchRequests[2].resolve([{ path: '/project/folder' }]);
    expect(await directories).toEqual([{ path: '/project/folder' }]);
    expect(runtimeSearchCalls).toHaveLength(1);
  });

  test('preserves indexed hits, reports supplemental failure and retries without caching partial results', async () => {
    const error = new Error('search failed');
    const warning = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      runtimeSearch = mock(async () => { throw error; });
      const pending = useFileSearchStore.getState().searchFiles('/project', 'x', 60, { includeHidden: true });
      const indexed = [{ path: '/project/x.ts' }];
      searchRequests[0].resolve(indexed);
      expect(await pending).toEqual(indexed);
      expect(warning.mock.calls).toEqual([['Supplemental file search failed; keeping indexed results:', error]]);
      expect(useFileSearchStore.getState().cache).toEqual({});
      expect(useFileSearchStore.getState().inFlight).toEqual({});

      runtimeSearch = mock(async () => [{ path: '/project/.x.ts', preview: ['.x.ts'] }]);
      const retry = useFileSearchStore.getState().searchFiles('/project', 'x', 60, { includeHidden: true });
      searchRequests[1].resolve(indexed);
      expect(await retry).toHaveLength(2);
      expect(Object.values(useFileSearchStore.getState().cache)).toHaveLength(1);
    } finally {
      warning.mockRestore();
    }
  });

  test('still rejects indexed failures without caching supplemental hits', async () => {
    runtimeSearch = mock(async () => [{ path: '/project/.x.ts', preview: ['.x.ts'] }]);
    const pending = useFileSearchStore.getState().searchFiles('/project', 'x', 60, { includeHidden: true });
    searchRequests[0].reject(new Error('index failed'));
    await expect(pending).rejects.toThrow('index failed');
    expect(useFileSearchStore.getState().cache).toEqual({});
    expect(useFileSearchStore.getState().inFlight).toEqual({});
  });

  test('does not cache a stale in-flight search after invalidation', async () => {
    const searchPromise = useFileSearchStore.getState().searchFiles('/project', 'foo');
    expect(Object.keys(useFileSearchStore.getState().inFlight)).toHaveLength(1);

    useFileSearchStore.getState().invalidateDirectory('/project');
    expect(Object.keys(useFileSearchStore.getState().inFlight)).toHaveLength(0);

    searchRequests[0].resolve([{ path: 'stale.ts' }]);
    await searchPromise;

    expect(useFileSearchStore.getState().cache).toEqual({});
    expect(useFileSearchStore.getState().cacheKeys).toEqual([]);
  });

  test('does not notify subscribers when stale search handlers make no state change', async () => {
    const searchPromise = useFileSearchStore.getState().searchFiles('/project', 'foo');
    useFileSearchStore.getState().invalidateDirectory('/project');

    let updateCount = 0;
    const unsubscribe = useFileSearchStore.subscribe(() => {
      updateCount += 1;
    });

    searchRequests[0].resolve([{ path: 'stale.ts' }]);
    await searchPromise;
    unsubscribe();

    expect(updateCount).toBe(0);
  });

  test('does not let a stale request remove a newer in-flight search', async () => {
    const stalePromise = useFileSearchStore.getState().searchFiles('/project', 'foo');
    useFileSearchStore.getState().invalidateDirectory('/project');
    const freshPromise = useFileSearchStore.getState().searchFiles('/project', 'foo');

    searchRequests[0].resolve([{ path: 'stale.ts' }]);
    await stalePromise;

    expect(Object.keys(useFileSearchStore.getState().inFlight)).toHaveLength(1);

    searchRequests[1].resolve([{ path: 'fresh.ts' }]);
    await freshPromise;

    const cacheEntries = Object.values(useFileSearchStore.getState().cache);
    expect(cacheEntries).toHaveLength(1);
    expect(cacheEntries[0]?.files).toEqual([{ path: 'fresh.ts' }]);
  });

  test('keeps directory and query separators from colliding in cache keys', async () => {
    const firstPromise = useFileSearchStore.getState().searchFiles('/project::nested', 'foo');
    searchRequests[0].resolve([{ path: 'first.ts' }]);
    await firstPromise;

    const secondPromise = useFileSearchStore.getState().searchFiles('/project', 'nested::foo');
    expect(searchRequests).toHaveLength(2);

    searchRequests[1].resolve([{ path: 'second.ts' }]);
    expect(await secondPromise).toEqual([{ path: 'second.ts' }]);
  });

  test('isolates cache and in-flight ownership by runtime', async () => {
    const firstPromise = useFileSearchStore.getState().searchFiles('/project', 'foo');
    runtimeKey = 'runtime-b';
    const secondPromise = useFileSearchStore.getState().searchFiles('/project', 'foo');
    expect(searchRequests).toHaveLength(2);

    searchRequests[1].resolve([{ path: 'runtime-b.ts' }]);
    expect(await secondPromise).toEqual([{ path: 'runtime-b.ts' }]);
    searchRequests[0].resolve([{ path: 'runtime-a.ts' }]);
    await firstPromise;

    runtimeKey = 'runtime-b';
    expect(await useFileSearchStore.getState().searchFiles('/project', 'foo')).toEqual([{ path: 'runtime-b.ts' }]);
    expect(searchRequests).toHaveLength(2);
  });

  test('validates empty remote identities and never reuses a remote TTL result', async () => {
    runtimeSource = async () => ({ kind: 'remote', sourceIdentity: 'source-a' });
    let calls = 0;
    const search = async () => { calls++; return { files: [], sourceIdentity: 'source-a' }; };
    runtimeSourceSearch = search;
    expect(await useFileSearchStore.getState().searchFiles('/project', 'missing')).toEqual([]);
    expect(await useFileSearchStore.getState().searchFiles('/project', 'missing')).toEqual([]);
    expect(calls).toBe(2);
    expect(searchRequests).toHaveLength(0);
    expect(useFileSearchStore.getState().cache).toEqual({});
    runtimeSourceSearch = async () => ({ files: [] });
    await assert.rejects(useFileSearchStore.getState().searchFiles('/project', 'missing'), { status: 503, reason: 'invalid-response' });
  });

  test('uses exactly one authoritative remote toggle result, including directory queries', async () => {
    runtimeSource = async () => ({ kind: 'remote', sourceIdentity: 'source-a' });
    const calls: FileSearchQuery[] = [];
    const search = async (query: FileSearchQuery) => { calls.push(query); return { files: [{ path: '/project/.hidden', preview: ['.hidden'] }], sourceIdentity: 'source-a' }; };
    runtimeSourceSearch = search;
    expect(await useFileSearchStore.getState().searchFiles('/project', 'hidden', 12,
      { includeHidden: true, respectGitignore: false, type: 'directory' })).toEqual([
      { path: '/project/.hidden', relativePath: '.hidden', name: '.hidden', extension: 'hidden' },
    ]);
    expect(searchRequests).toHaveLength(0);
    expect(calls).toEqual([{ directory: '/project', query: 'hidden', maxResults: 12,
      includeHidden: true, respectGitignore: false, type: 'directory' }]);
    const failure = new FilesystemError('unavailable', { status: 503, reason: 'remote-unavailable' });
    runtimeSourceSearch = async () => { throw failure; };
    await assert.rejects(useFileSearchStore.getState().searchFiles('/project', 'hidden', 12, { includeHidden: true }), (error) => error === failure);
    expect(searchRequests).toHaveLength(0);
  });

  test('does not fall back to the index when remote source metadata support is missing', async () => {
    runtimeSource = async () => ({ kind: 'remote', sourceIdentity: 'source-a' });
    await assert.rejects(useFileSearchStore.getState().searchFiles('/project', 'x'), { status: 503, reason: 'invalid-response' });
    expect(searchRequests).toHaveLength(0);
    runtimeSource = async () => { throw new FilesystemError('bad source', { status: 503, reason: 'invalid-response' }); };
    await assert.rejects(useFileSearchStore.getState().searchFiles('/project', 'x'), { status: 503, reason: 'invalid-response' });
    expect(searchRequests).toHaveLength(0);
  });

  test('revalidates current binding and rejects stale empty/runtime completion', async () => {
    let identity = 'source-a';
    runtimeSource = async () => ({ kind: 'remote', sourceIdentity: identity });
    runtimeSourceSearch = async () => { identity = 'source-b'; return { files: [], sourceIdentity: 'source-a' }; };
    await assert.rejects(useFileSearchStore.getState().searchFiles('/project', 'x'), { status: 409, reason: 'remote-source-changed' });
    const pending = createDeferred<FileSearchOutcome>();
    const started = createDeferred<void>();
    runtimeSourceSearch = async () => { started.resolve(undefined); return pending.promise; };
    const reading = useFileSearchStore.getState().searchFiles('/project', 'x');
    const settled = reading.then((value) => ({ ok: true, value }), (error: unknown) => ({ ok: false, error }));
    await started.promise;
    runtimeKey = 'runtime-b';
    useFileSearchStore.getState().resetForRuntimeSwitch();
    pending.resolve({ files: [], sourceIdentity: 'source-b' });
    expect(await settled).toMatchObject({ ok: false, error: { status: 409, reason: 'remote-source-changed' } });
    expect(useFileSearchStore.getState().cache).toEqual({});
    expect(searchRequests).toHaveLength(0);
  });

  test('shares a bounded in-flight remote query without retaining its result', async () => {
    runtimeSource = async () => ({ kind: 'remote', sourceIdentity: 'source-a' });
    const pending = createDeferred<FileSearchOutcome>();
    let calls = 0;
    const search = async () => { calls++; return pending.promise; };
    runtimeSourceSearch = search;
    const first = useFileSearchStore.getState().searchFiles('/project', 'x');
    const second = useFileSearchStore.getState().searchFiles('/project', 'x');
    pending.resolve({ files: [], sourceIdentity: 'source-a' });
    expect(await first).toEqual([]);
    expect(await second).toEqual([]);
    expect(calls).toBe(1);
    expect(useFileSearchStore.getState().inFlight).toEqual({});
  });
});
