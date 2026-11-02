import type { FileReadResult, FileStatResult, FilesAPI } from '@/lib/api/types';
import { assertFileSourceIdentity, changedFileSource, invalidFileResponse, requireFileSourceIdentity } from '@/lib/api/file-source';
import { isFilesystemError } from '@/lib/api/files-errors';
import { subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';

const MAX_ENTRIES = 40;
const MAX_BYTES = 20 * 1024 * 1024;
type Entry = FileReadResult & { sourcePath: string; size: number; mtimeMs: number; bytes: number };

/**
 * Content-cached `FilesAPI.readFile` wrapper.
 *
 * Lifecycle: `RuntimeAPIProvider` owns create/dispose in an effect so React
 * Strict Mode remounts get a fresh owner. After `dispose()`, reads throw —
 * callers must not keep using a torn-down owner. Runtime endpoint switches
 * bump generation and clear the cache without deactivating the owner.
 */
export function createContentCachedFiles(files: FilesAPI): { files: FilesAPI; dispose: () => void } {
  const cache = new Map<string, Entry>();
  let totalBytes = 0;
  let generation = 0;
  let runtimeGeneration = 0;
  let active = true;
  let mutationBarrier = Promise.resolve();

  const cacheKey = (path: string, options?: Parameters<NonNullable<FilesAPI['readFile']>>[1]) =>
    JSON.stringify([options?.directory ?? '', path]);
  const contentBytes = (content: string) => new TextEncoder().encode(content).byteLength;
  const removeEntry = (key: string) => {
    const entry = cache.get(key);
    if (entry) totalBytes = Math.max(0, totalBytes - entry.bytes);
    cache.delete(key);
  };
  const removePrefix = (path: string) => {
    const prefix = path.endsWith('/') ? path : `${path}/`;
    for (const [key, entry] of cache) {
      if (entry.sourcePath === path || entry.sourcePath.startsWith(prefix)) removeEntry(key);
    }
  };
  const metadataMatches = (cached: Entry, latest: FileStatResult) => (
    latest.isFile
    && latest.mtimeMs !== undefined
    && cached.mtimeMs === latest.mtimeMs
    && cached.size === latest.size
  );
  const clearCache = () => {
    cache.clear();
    totalBytes = 0;
  };
  const cacheResult = (
    key: string,
    sourcePath: string,
    result: FileReadResult,
    stat: FileStatResult,
  ) => {
    if (!active || !stat.isFile || stat.size === undefined || stat.mtimeMs === undefined) return result;
    const bytes = contentBytes(result.content);
    if (bytes > MAX_BYTES) return result;
    removeEntry(key);
    cache.set(key, { ...result, sourcePath, size: stat.size, mtimeMs: stat.mtimeMs, bytes });
    totalBytes += bytes;
    while (cache.size > MAX_ENTRIES || totalBytes > MAX_BYTES) {
      const oldest = cache.keys().next().value;
      if (!oldest) break;
      removeEntry(oldest);
    }
    return result;
  };

  const assertRemoteCurrent = (capturedGeneration: number, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    if (!active) throw new Error('File cache owner disposed');
    if (capturedGeneration !== generation) throw changedFileSource();
  };

  const confirmRemoteSource = async (directory: string, sourceIdentity: string, capturedGeneration: number, signal?: AbortSignal) => {
    assertRemoteCurrent(capturedGeneration, signal);
    if (!files.resolveWorkspaceFileSource) throw invalidFileResponse();
    const current = await files.resolveWorkspaceFileSource(directory, { signal });
    assertRemoteCurrent(capturedGeneration, signal);
    if (current.kind !== 'remote') throw changedFileSource();
    assertFileSourceIdentity(current.sourceIdentity, sourceIdentity);
  };

  const remoteStat = async (
    path: string,
    options: Parameters<NonNullable<FilesAPI['readFile']>>[1],
    sourceIdentity: string,
    capturedGeneration: number,
  ): Promise<FileStatResult> => {
    assertRemoteCurrent(capturedGeneration, options?.signal);
    if (!files.statFile) throw invalidFileResponse();
    const stat = await files.statFile(path, options);
    assertRemoteCurrent(capturedGeneration, options?.signal);
    assertFileSourceIdentity(stat.sourceIdentity, sourceIdentity);
    if (stat.path !== path) throw invalidFileResponse();
    if (stat.exists === false && options?.optional) return stat;
    if (!stat.isFile || !Number.isFinite(stat.size) || stat.size! < 0
      || !Number.isFinite(stat.mtimeMs)) throw invalidFileResponse();
    return stat;
  };

  const readRemote = async (
    key: string,
    path: string,
    options: Parameters<NonNullable<FilesAPI['readFile']>>[1],
    sourceIdentity: string,
    capturedGeneration: number,
  ): Promise<FileReadResult> => {
    try {
      assertRemoteCurrent(capturedGeneration, options?.signal);
      requireFileSourceIdentity(sourceIdentity);
      const hit = cache.get(key);
      if (hit) assertFileSourceIdentity(hit.sourceIdentity, sourceIdentity);
      const before = await remoteStat(path, options, sourceIdentity, capturedGeneration);
      if (hit && !options?.fresh && metadataMatches(hit, before)) {
        await confirmRemoteSource(options?.directory ?? '', sourceIdentity, capturedGeneration, options?.signal);
        cache.delete(key);
        cache.set(key, hit);
        return { content: hit.content, path: hit.path, sourceIdentity };
      }
      removeEntry(key);
      const result = await files.readFile!(path, options);
      assertRemoteCurrent(capturedGeneration, options?.signal);
      assertFileSourceIdentity(result.sourceIdentity, sourceIdentity);
      if (result.path !== path) throw invalidFileResponse();
      const after = await remoteStat(path, options, sourceIdentity, capturedGeneration);
      await confirmRemoteSource(options?.directory ?? '', sourceIdentity, capturedGeneration, options?.signal);
      if (before.exists === false && after.exists === false) {
        if (result.content !== '') throw invalidFileResponse();
        return result;
      }
      if (!before.isFile || !after.isFile || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
        throw changedFileSource();
      }
      if (contentBytes(result.content) !== after.size) throw invalidFileResponse();
      return cacheResult(key, path, result, after);
    } catch (error) {
      removeEntry(key);
      throw error;
    }
  };

  const localStat = async (path: string, options: Parameters<NonNullable<FilesAPI['readFile']>>[1]) =>
    files.statFile?.(path, options).catch((cause: unknown) => {
      if (isFilesystemError(cause) && ['remote-unavailable', 'remote-source-changed', 'invalid-response'].includes(cause.reason)) throw cause;
      return null;
    });

  const readFresh = async (
    key: string,
    path: string,
    options: Parameters<NonNullable<FilesAPI['readFile']>>[1] | undefined,
    capturedGeneration: number,
  ): Promise<{ content: string; path: string }> => {
    const before = await localStat(path, options);
    const result = await files.readFile!(path, options);
    const after = await localStat(path, options);
    if (before?.sourceIdentity !== undefined || result.sourceIdentity !== undefined || after?.sourceIdentity !== undefined) {
      removeEntry(key);
      throw invalidFileResponse();
    }
    if (!active) throw new Error('File cache owner disposed');
    if (capturedGeneration !== generation) return cachedReadFile!(path, options);
    const stable = before && after && before.isFile && after.isFile
      && before.mtimeMs !== undefined && after.mtimeMs !== undefined
      && before.size === after.size && before.mtimeMs === after.mtimeMs;
    return stable ? cacheResult(key, path, result, after) : result;
  };

  const cachedReadFile: FilesAPI['readFile'] = files.readFile
    ? async (path, options) => {
        const requestedRuntimeGeneration = runtimeGeneration;
        await mutationBarrier;
        if (!active) throw new Error('File cache owner disposed');
        const capturedGeneration = generation;
        const key = cacheKey(path, options);
        if (files.resolveWorkspaceFileSource) {
          try {
            if (requestedRuntimeGeneration !== runtimeGeneration) throw changedFileSource();
            assertRemoteCurrent(capturedGeneration, options?.signal);
            const source = await files.resolveWorkspaceFileSource(options?.directory ?? '', { signal: options?.signal });
            if (source.kind === 'remote') {
              return await readRemote(key, path, options, source.sourceIdentity, capturedGeneration);
            }
            if (cache.get(key)?.sourceIdentity !== undefined) throw changedFileSource();
          } catch (error) {
            removeEntry(key);
            throw error;
          }
        }
        if (options?.allowOutsideWorkspace) return files.readFile!(path, options);
        if (options?.fresh) {
          removeEntry(key);
          return files.readFile!(path, options);
        }
        const hit = cache.get(key);
        if (!hit) return readFresh(key, path, options, capturedGeneration);
        let latest: FileStatResult | null | undefined;
        try { latest = await localStat(path, options); }
        catch (error) { removeEntry(key); throw error; }
        if (latest?.sourceIdentity !== undefined) { removeEntry(key); throw invalidFileResponse(); }
        if (!active) throw new Error('File cache owner disposed');
        if (capturedGeneration !== generation) return cachedReadFile!(path, options);
        if (!latest || !metadataMatches(hit, latest)) {
          removeEntry(key);
          return readFresh(key, path, options, capturedGeneration);
        }
        cache.delete(key);
        cache.set(key, hit);
        return { content: hit.content, path: hit.path };
      }
    : undefined;

  const mutate = async <T>(paths: string[], operation: () => Promise<T>): Promise<T> => {
    const previous = mutationBarrier;
    let release!: () => void;
    mutationBarrier = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    generation += 1;
    paths.forEach(removePrefix);
    try {
      return await operation();
    } finally {
      paths.forEach(removePrefix);
      generation += 1;
      release();
    }
  };

  const cachedFiles: FilesAPI = {
    ...files,
    readFile: cachedReadFile,
    writeFile: files.writeFile ? (path, content) => mutate([path], () => files.writeFile!(path, content)) : undefined,
    delete: files.delete ? (path) => mutate([path], () => files.delete!(path)) : undefined,
    rename: files.rename ? (oldPath, newPath) => mutate([oldPath, newPath], () => files.rename!(oldPath, newPath)) : undefined,
  };
  const unsubscribeRuntime = subscribeRuntimeEndpointWillChange((detail) => {
    if (detail.runtimeKey === detail.previousRuntimeKey) return;
    runtimeGeneration += 1;
    // Invalidate cached content for the previous runtime, but keep serving reads.
    // `apis.files` is typically stable across endpoint switches, so permanently
    // deactivating this owner would break every subsequent text-file open.
    generation += 1;
    clearCache();
  });
  return {
    files: cachedFiles,
    dispose: () => {
      active = false;
      generation += 1;
      clearCache();
      unsubscribeRuntime();
    },
  };
}
