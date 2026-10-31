import { z } from 'zod';

import type {
  DirectoryListResult,
  FileContentSearchOutcome,
  FileContentSearchQuery,
  FileSearchQuery,
  FileSearchResult,
  FileSearchOutcome,
  FileReadResult,
  FileStatResult,
  WorkspaceFileSource,
  FilesAPI,
} from '@openchamber/ui/lib/api/types';
import { opencodeClient, type ProjectFileSearchOptions, type ProjectFileSearchOutcome } from '@openchamber/ui/lib/opencode/client';
import { assertFileSourceIdentity, changedFileSource, fileSourceIdentitySchema, invalidFileResponse, requireFileSourceIdentity } from '@openchamber/ui/lib/api/file-source';
import { createFileRequestScope, fileErrorResponseSchema, fileResponseError, FILE_ERROR_BYTES, FILE_JSON_BYTES, FILE_SOURCE_HEADER,
  readFileResponseJSON, readFileResponseText, type FileRequestScope, type FileRequestRuntime } from './file-responses';
import {
  FilesystemError,
  parseFilesystemErrorReason,
  type FilesystemErrorReason,
} from '@openchamber/ui/lib/api/files-errors';
import { runtimeFetch } from '@openchamber/ui/lib/runtime-fetch';
import type { RuntimeUrlResolver } from '@openchamber/ui/lib/runtime-url';
import { spaceIdOfDirectory, spaceRootDirectory } from '@openchamber/ui/lib/spaces/space-route';
import { shareFileFromNativeApp } from '@openchamber/ui/lib/nativeFileShare';

const normalizePath = (path: string): string => path.replace(/\\/g, '/');

type SearchFiles = typeof opencodeClient.searchFiles;
type SourceSearchFiles = (query: string, options?: ProjectFileSearchOptions) => Promise<ProjectFileSearchOutcome>;

export interface WebFileDependencies {
  fetch?: typeof runtimeFetch;
  runtime?: FileRequestRuntime;
}

interface WebFilesAPIOptions {
  urls?: RuntimeUrlResolver;
  dependencies?: WebFileDependencies;
  getDirectory?: () => string | undefined;
  /** File search; defaults to OpenCode's `file.find` through the shared client. */
  searchFiles?: SearchFiles;
  searchFilesWithSource?: SourceSearchFiles;
  resolveWorkspaceFileSource?: NonNullable<FilesAPI['resolveWorkspaceFileSource']>;
}

const defaultSearchFiles: SearchFiles = (query, options) => opencodeClient.searchFiles(query, options);
const defaultSearchFilesWithSource: SourceSearchFiles = (query, options) => opencodeClient.searchFilesWithSource(query, options);

const directoryEntrySchema = z.object({
  name: z.string(), path: z.string(), isDirectory: z.json().optional().transform(Boolean),
});

const directoryListSchema = z.object({
  directory: z.string().optional(), path: z.string().optional(),
  entries: z.array(z.json()).transform((entries) => entries.flatMap((entry) => {
    const parsed = directoryEntrySchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  })),
});

const remoteDirectoryListSchema = z.object({
  sourceIdentity: fileSourceIdentitySchema,
  path: z.string().optional(), directory: z.string().optional(),
  entries: z.array(directoryEntrySchema.extend({
    name: z.string().min(1).refine((name) => !name.includes('/') && !name.includes('\\')
      && name !== '.' && name !== '..' && !name.includes('\0')),
    isDirectory: z.boolean(), isFile: z.boolean(),
    isSymbolicLink: z.boolean().optional().refine((value) => value !== true),
  }).refine((entry) => entry.isFile !== entry.isDirectory)).max(1000),
});

const statEnvelopeSchema = z.object({
  sourceKind: z.string().optional(), sourceIdentity: z.string().optional(),
  path: z.string().optional(), exists: z.boolean().optional(),
  isFile: z.boolean().optional(), size: z.number().optional(), mtimeMs: z.number().optional(),
  error: z.string().optional().catch(undefined), reason: z.string().optional().catch(undefined),
});
const rootStatResponseSchema = z.union([z.object({ sourceKind: z.literal('local') }), statEnvelopeSchema]);

const remotePresentStatSchema = z.object({
  sourceKind: z.literal('remote'), sourceIdentity: fileSourceIdentitySchema, path: z.string(),
  exists: z.literal(true).optional(), isFile: z.boolean(),
  size: z.number().finite().nonnegative(), mtimeMs: z.number().finite(),
});
const remoteStatSchema = z.union([remotePresentStatSchema, z.object({
  sourceKind: z.literal('remote'), sourceIdentity: fileSourceIdentitySchema, path: z.string(), exists: z.literal(false),
})]);

type WebFileMutationResponse = {
  success?: boolean;
  path?: string;
  error?: string;
  reason?: FilesystemErrorReason;
};

const toDirectoryListResult = (fallbackDirectory: string, payload: z.infer<typeof directoryListSchema>): DirectoryListResult => {
  const directory = normalizePath(payload?.directory || payload?.path || fallbackDirectory);

  return {
    directory,
    entries: payload.entries
      .map((entry) => ({
        name: entry.name,
        path: normalizePath(entry.path),
        isDirectory: Boolean(entry.isDirectory),
      })),
  };
};

/**
 * The directory a request names: the caller's, else the folder open in the app. A path inside an
 * isolated space is served by that space only, so a request for one names the space when the open
 * folder is elsewhere: a draft waiting for a space shows the space's files from the project's.
 */
const directoryHeaders = (getDirectory?: () => string | undefined, override?: string, path?: string): Record<string, string> | undefined => {
  const current = getDirectory?.();
  const pathSpace = spaceIdOfDirectory(path);
  const directory = override
    || (pathSpace !== null && spaceIdOfDirectory(current) !== pathSpace ? spaceRootDirectory(pathSpace) : current);
  return directory ? { 'x-opencode-directory': directory } : undefined;
};

const contentSearchResponseSchema = z.object({
  matches: z.array(z.object({
    path: z.string(),
    relativePath: z.string(),
    line: z.number().int().positive(),
    column: z.number().int().positive(),
    text: z.string(),
    ranges: z.array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])),
    cutStart: z.boolean(),
  })),
  stopped: z.enum(['limit', 'deadline']).nullable(),
});

const contentSearchErrorSchema = z.object({
  error: z.string().optional(),
  reason: z.string().optional(),
});

const fileSearchResponseSchema = z.object({
  files: z.array(z.object({ path: z.string(), relativePath: z.string() })),
});
const remoteFileSearchResponseSchema = fileSearchResponseSchema.extend({ sourceIdentity: fileSourceIdentitySchema });

const payloadError = (payload: z.infer<typeof fileErrorResponseSchema>, status: number) => new FilesystemError(
  payload.error ?? 'File request failed',
  { status, reason: parseFilesystemErrorReason(payload.reason) },
);

const jsonIdentity = (payload: { sourceIdentity?: string }, response: Response, expected?: string): string => {
  const identity = requireFileSourceIdentity(payload.sourceIdentity);
  if (expected !== undefined) assertFileSourceIdentity(identity, expected);
  const header = response.headers.get(FILE_SOURCE_HEADER);
  if (header !== null) assertFileSourceIdentity(header, identity);
  return identity;
};

const validateSearchPath = (path: string, relativePath: string, directory: string) => {
  if (!relativePath
    || relativePath.includes('\\') || relativePath.startsWith('/') || relativePath.includes('\0')
    || relativePath.split('/').some((part) => !part || part === '.' || part === '..')
    || normalizePath(path) !== `${directory.replace(/\/$/, '')}/${relativePath}`) throw invalidFileResponse();
};

const searchFailureSchema = z.object({
  status: z.number(), reason: z.string().optional().catch(undefined), kind: z.string().optional().catch(undefined),
});

const throwFileSearchError = (cause: unknown): never => {
  if (cause instanceof FilesystemError) throw cause;
  const parsed = searchFailureSchema.safeParse(cause);
  if (!parsed.success) throw cause;
  const reason = parseFilesystemErrorReason(parsed.data.reason);
  throw new FilesystemError(cause instanceof Error ? cause.message : 'File search failed', {
    status: parsed.data.status,
    reason: reason !== 'unknown' ? reason : parseFilesystemErrorReason(parsed.data.kind),
  });
};

export const createWebWorkspaceFileSourceResolver = ({ getDirectory, dependencies }: Pick<WebFilesAPIOptions, 'getDirectory' | 'dependencies'>): NonNullable<FilesAPI['resolveWorkspaceFileSource']> =>
  async (directory, options) => {
    const root = normalizePath(directory || getDirectory?.() || '');
    if (!root || root.includes('\0')) throw new FilesystemError('Workspace directory required', { status: 400, reason: 'invalid-path' });
    const scope = createFileRequestScope(options?.signal, true, dependencies?.runtime);
    try {
      const response = await scope.wait((dependencies?.fetch ?? runtimeFetch)('/api/fs/stat', {
        query: new URLSearchParams({ path: root }), signal: scope.signal,
        headers: directoryHeaders(getDirectory, root), cache: 'no-store',
      }));
      if (!response.ok) {
        const payload = await readFileResponseJSON(response, scope, fileErrorResponseSchema, FILE_ERROR_BYTES);
        if (payload.sourceKind === 'local' && response.status === 400) return { kind: 'local' };
        if (payload.sourceKind === 'local' || payload.sourceKind === 'remote' || [401, 403, 500].includes(response.status)) {
          throw payloadError(payload, response.status);
        }
        throw invalidFileResponse();
      }
      const payload = await readFileResponseJSON(response, scope, rootStatResponseSchema);
      if (payload.sourceKind === 'local') return { kind: 'local' };
      if (payload.sourceKind !== 'remote') throw invalidFileResponse();
      const sourceIdentity = jsonIdentity(payload, response);
      const stat = remotePresentStatSchema.safeParse(payload);
      if (!stat.success || stat.data.path !== root || stat.data.isFile !== false) throw invalidFileResponse();
      scope.check();
      return { kind: 'remote', sourceIdentity };
    } finally { scope.dispose(); }
  };

export const createWebFilesAPI = ({ getDirectory, searchFiles = defaultSearchFiles,
  searchFilesWithSource = defaultSearchFilesWithSource, resolveWorkspaceFileSource, dependencies }: WebFilesAPIOptions): FilesAPI => {
  const fetchFiles = dependencies?.fetch ?? runtimeFetch;
  const requestScope = (signal?: AbortSignal, remote = true) => createFileRequestScope(signal, remote, dependencies?.runtime);
  const directoryOf = (override?: string, path?: string) => directoryHeaders(getDirectory, override, path)?.['x-opencode-directory'] ?? '';
  const start = async (directory: string, signal?: AbortSignal) => {
    if (!resolveWorkspaceFileSource) return { source: { kind: 'local' } satisfies WorkspaceFileSource, scope: requestScope(signal, false) };
    const scope = requestScope(signal);
    try {
      const source = await scope.wait(resolveWorkspaceFileSource(directory, { signal: scope.signal }));
      if (source.kind === 'remote') {
        requireFileSourceIdentity(source.sourceIdentity);
        return { source, scope };
      }
      if (source.kind !== 'local') throw invalidFileResponse();
      scope.dispose();
      return { source, scope: requestScope(signal, false) };
    } catch (error) { scope.dispose(); throw error; }
  };
  const complete = async (source: WorkspaceFileSource, directory: string, scope: FileRequestScope) => {
    scope.check();
    if (source.kind !== 'remote') return;
    if (!resolveWorkspaceFileSource) throw invalidFileResponse();
    const current = await scope.wait(resolveWorkspaceFileSource(directory, { signal: scope.signal }));
    if (current.kind !== 'remote') throw changedFileSource();
    assertFileSourceIdentity(current.sourceIdentity, source.sourceIdentity);
    scope.check();
  };
  const rejectResponse = async (response: Response, source: WorkspaceFileSource, directory: string, scope: FileRequestScope): Promise<never> => {
    const failure = await fileResponseError(response, scope);
    if (source.kind === 'remote' && response.status === 404) {
      assertFileSourceIdentity(response.headers.get(FILE_SOURCE_HEADER), source.sourceIdentity);
      if (failure.reason !== 'not-found') throw invalidFileResponse();
      await complete(source, directory, scope);
    }
    throw failure;
  };
  const searchWithSource = async (payload: FileSearchQuery): Promise<FileSearchOutcome> => {
    const directory = normalizePath(payload.directory);
    const { source, scope } = await start(directory, payload.signal);
    try {
      const includeHidden = Boolean(payload.includeHidden);
      const respectGitignore = payload.respectGitignore !== false;
      if (source.kind === 'remote' && ((payload.type !== undefined && payload.type !== 'file' && payload.type !== 'directory')
        || (payload.maxResults !== undefined && (!Number.isInteger(payload.maxResults) || payload.maxResults < 1)))) {
        throw new FilesystemError('Invalid file search query', { status: 400, reason: 'invalid-path' });
      }
      const remoteLimit = Math.min(100, payload.maxResults ?? 100);
      if (source.kind === 'remote' && !includeHidden && respectGitignore) {
        const outcome = await scope.wait(searchFilesWithSource(payload.query, {
          directory, limit: payload.maxResults === undefined ? undefined : remoteLimit, type: payload.type ?? 'file', signal: scope.signal,
          expectedSourceIdentity: source.sourceIdentity,
        })).catch((cause: unknown) => { scope.check(); return throwFileSearchError(cause); });
        const parsed = remoteFileSearchResponseSchema.safeParse(outcome);
        if (!parsed.success) throw invalidFileResponse();
        const result = parsed.data;
        assertFileSourceIdentity(result.sourceIdentity, source.sourceIdentity);
        if (result.files.length > remoteLimit) throw invalidFileResponse();
        for (const file of result.files) validateSearchPath(file.path, file.relativePath, directory);
        await complete(source, directory, scope);
        return { files: result.files.map((file) => ({ path: normalizePath(file.path), preview: [normalizePath(file.relativePath)] })),
          sourceIdentity: source.sourceIdentity };
      }
      if (includeHidden || !respectGitignore) {
        const params = new URLSearchParams({ query: payload.query });
        if (directory) params.set('directory', directory);
        if (payload.maxResults !== undefined && Number.isFinite(payload.maxResults)) params.set('limit', String(source.kind === 'remote' ? remoteLimit : payload.maxResults));
        if (includeHidden) params.set('includeHidden', 'true');
        if (!respectGitignore) params.set('respectGitignore', 'false');
        if (source.kind === 'remote') {
          if (payload.includeHidden !== undefined) params.set('includeHidden', String(payload.includeHidden));
          if (payload.respectGitignore !== undefined) params.set('respectGitignore', String(payload.respectGitignore));
        }
        if (source.kind === 'remote' && payload.type !== undefined) params.set('type', payload.type);
        const request: Parameters<typeof runtimeFetch>[1] = {
          query: params, headers: directoryHeaders(getDirectory, directory),
        };
        if (source.kind === 'remote' || payload.signal) request.signal = scope.signal;
        const response = await scope.wait(fetchFiles('/api/fs/search', request));
        if (!response.ok) await rejectResponse(response, source, directory, scope);
        if (source.kind === 'remote') {
          const result = await readFileResponseJSON(response, scope, remoteFileSearchResponseSchema);
          jsonIdentity(result, response, source.sourceIdentity);
          if (result.files.length > remoteLimit) throw invalidFileResponse();
          for (const file of result.files) validateSearchPath(file.path, file.relativePath, directory);
          await complete(source, directory, scope);
          return { files: result.files.map((file) => ({ path: normalizePath(file.path), preview: [normalizePath(file.relativePath)] })),
            sourceIdentity: source.sourceIdentity };
        }
        const result = fileSearchResponseSchema.safeParse(await scope.wait(response.json()));
        if (!result.success) throw invalidFileResponse();
        await complete(source, directory, scope);
        return { files: result.data.files.map((file) => ({ path: normalizePath(file.path), preview: [normalizePath(file.relativePath)] })) };
      }
      const hits = await scope.wait(searchFiles(payload.query, { directory,
        limit: payload.maxResults !== undefined && Number.isFinite(payload.maxResults) ? payload.maxResults : undefined,
        type: 'file' }));
      return { files: hits.map((hit) => ({ path: normalizePath(hit.path), preview: [normalizePath(hit.relativePath)] })) };
    } finally { scope.dispose(); }
  };
  return {
  resolveWorkspaceFileSource,
  searchWithSource,
  async listDirectory(path: string, options): Promise<DirectoryListResult> {
    const target = normalizePath(path);
    const directory = directoryOf(undefined, target);
    const { source, scope } = await start(directory, options?.signal);
    try {
    const params = new URLSearchParams();
    if (target) {
      params.set('path', target);
    }
    if (options?.respectGitignore) {
      params.set('respectGitignore', 'true');
    }
    if (source.kind === 'remote' && options?.respectGitignore !== undefined) {
      params.set('respectGitignore', String(options.respectGitignore));
    }

    const request: Parameters<typeof runtimeFetch>[1] = {
      query: params,
      headers: directoryHeaders(getDirectory, undefined, target),
    };
    if (source.kind === 'remote' || options?.signal) request.signal = scope.signal;
    const response = await scope.wait(fetchFiles('/api/fs/list', request));

    if (!response.ok) {
      await rejectResponse(response, source, directory, scope);
    }

    let result: DirectoryListResult;
    if (source.kind === 'remote') {
      const record = await readFileResponseJSON(response, scope, remoteDirectoryListSchema);
      jsonIdentity(record, response, source.sourceIdentity);
      if ((record.path === undefined && record.directory === undefined)
        || (record.path !== undefined && record.path !== target) || (record.directory !== undefined && record.directory !== target)
        ) throw invalidFileResponse();
      const seen = new Set<string>();
      for (const entry of record.entries) {
        if (entry.path !== `${target.replace(/\/$/, '')}/${entry.name}`) throw invalidFileResponse();
        if (seen.has(entry.name)) throw invalidFileResponse();
        seen.add(entry.name);
      }
      result = toDirectoryListResult(target, record);
      result.sourceIdentity = source.sourceIdentity;
    } else {
      const parsed = directoryListSchema.safeParse(await scope.wait(response.json()));
      if (!parsed.success) throw invalidFileResponse();
      result = toDirectoryListResult(target, parsed.data);
    }
    await complete(source, directory, scope);
    return result;
    } finally { scope.dispose(); }
  },

  async search(payload: FileSearchQuery): Promise<FileSearchResult[]> {
    return (await searchWithSource(payload)).files;
  },

  async searchContents(payload: FileContentSearchQuery): Promise<FileContentSearchOutcome> {
    const directory = normalizePath(payload.directory);
    const params = new URLSearchParams({ query: payload.query, regex: payload.regex ? 'true' : 'false' });
    if (payload.limit !== undefined) {
      params.set('limit', String(payload.limit));
    }
    if (payload.includeHidden) {
      params.set('includeHidden', 'true');
    }
    if (payload.respectGitignore === false) {
      params.set('respectGitignore', 'false');
    }

    const response = await fetchFiles('/api/fs/find-in-files', {
      query: params,
      cache: 'no-store',
      signal: payload.signal,
      headers: directoryHeaders(getDirectory, directory),
    });

    if (response.ok) {
      const parsed = contentSearchResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) {
        throw new FilesystemError('Content search returned an invalid response', { reason: 'invalid-response' });
      }
      return {
        status: 'ok',
        matches: parsed.data.matches.map((match) => ({ ...match, path: normalizePath(match.path) })),
        stopped: parsed.data.stopped,
      };
    }

    const failure = contentSearchErrorSchema.safeParse(await response.json().catch(() => null));
    const reason = failure.success ? failure.data.reason : undefined;
    if (response.status === 501 && reason === 'search-unavailable') {
      return { status: 'unavailable' };
    }
    if (response.status === 400 && reason === 'invalid-pattern') {
      return { status: 'invalid-pattern', message: failure.success && failure.data.error ? failure.data.error : 'Invalid regular expression' };
    }
    throw new FilesystemError(
      (failure.success && failure.data.error) || response.statusText || 'Failed to search file contents',
      { status: response.status },
    );
  },

  async createDirectory(path: string): Promise<{ success: boolean; path: string }> {
    const target = normalizePath(path);
    const response = await fetchFiles('/api/fs/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...directoryHeaders(getDirectory, undefined, target) },
      body: JSON.stringify({ path: target }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as { error?: string }).error || 'Failed to create directory');
    }

    const result = await response.json();
    return {
      success: Boolean(result?.success),
      path: typeof result?.path === 'string' ? normalizePath(result.path) : target,
    };
  },

  async statFile(path: string, options): Promise<FileStatResult> {
    const target = normalizePath(path);
    const directory = directoryOf(options?.directory, target);
    const signal = AbortSignal.any([AbortSignal.timeout(30_000), ...(options?.signal ? [options.signal] : [])]);
    const { source, scope } = await start(directory, signal);
    try {
    const params = new URLSearchParams({ path: target });
    if (options?.allowOutsideWorkspace) {
      params.set('allowOutsideWorkspace', 'true');
    }
    if (options?.outsideFileGrant) {
      params.set('outsideFileGrant', options.outsideFileGrant);
    }
    if (source.kind === 'remote' && options?.optional) params.set('optional', 'true');
    const response = await scope.wait(fetchFiles('/api/fs/stat', {
      query: params,
      signal: scope.signal,
      headers: directoryHeaders(getDirectory, options?.directory, target),
    }));

    if (!response.ok) {
      await rejectResponse(response, source, directory, scope);
    }

    if (source.kind === 'remote') {
      const result = await readFileResponseJSON(response, scope, remoteStatSchema);
      jsonIdentity(result, response, source.sourceIdentity);
      if (result.sourceKind !== 'remote' || result.path !== target) throw invalidFileResponse();
      if (result.exists === false) {
        if (!options?.optional) throw invalidFileResponse();
        assertFileSourceIdentity(response.headers.get(FILE_SOURCE_HEADER), source.sourceIdentity);
        await complete(source, directory, scope);
        return { path: target, isFile: false, exists: false, sourceIdentity: source.sourceIdentity };
      }
      await complete(source, directory, scope);
      return { path: target, isFile: result.isFile, size: result.size, mtimeMs: result.mtimeMs, sourceIdentity: source.sourceIdentity };
    }
    const result = await scope.wait(response.json()).catch(() => { scope.check(); return {}; });
    return {
      path: typeof (result as { path?: string }).path === 'string' ? normalizePath((result as { path: string }).path) : target,
      isFile: Boolean((result as { isFile?: boolean }).isFile),
      size: typeof (result as { size?: number }).size === 'number' ? (result as { size: number }).size : 0,
      mtimeMs: typeof (result as { mtimeMs?: number }).mtimeMs === 'number' ? (result as { mtimeMs: number }).mtimeMs : undefined,
    };
    } finally { scope.dispose(); }
  },

  async readFile(path: string, options): Promise<FileReadResult> {
    const target = normalizePath(path);
    const directory = directoryOf(options?.directory, target);
    const signal = AbortSignal.any([AbortSignal.timeout(30_000), ...(options?.signal ? [options.signal] : [])]);
    const { source, scope } = await start(directory, signal);
    try {
    const params = new URLSearchParams({ path: target });
    if (options?.allowOutsideWorkspace) {
      params.set('allowOutsideWorkspace', 'true');
    }
    if (options?.outsideFileGrant) {
      params.set('outsideFileGrant', options.outsideFileGrant);
    }
    if (options?.optional) {
      params.set('optional', 'true');
    }
    const response = await scope.wait(fetchFiles('/api/fs/read', {
      query: params,
      signal: scope.signal,
      cache: options?.optional || options?.fresh ? 'no-store' : 'default',
      headers: directoryHeaders(getDirectory, options?.directory, target),
    }));

    if (!response.ok) {
      await rejectResponse(response, source, directory, scope);
    }

    if (source.kind === 'remote') {
      assertFileSourceIdentity(response.headers.get(FILE_SOURCE_HEADER), source.sourceIdentity);
      const content = await readFileResponseText(response, scope, FILE_JSON_BYTES);
      await complete(source, directory, scope);
      return { content, path: target, sourceIdentity: source.sourceIdentity };
    }
    const content = await scope.wait(response.text());
    return { content, path: target };
    } finally { scope.dispose(); }
  },

  async writeFile(path: string, content: string): Promise<{ success: boolean; path: string }> {
    const target = normalizePath(path);
    const response = await fetchFiles('/api/fs/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...directoryHeaders(getDirectory, undefined, target) },
      body: JSON.stringify({ path: target, content }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as { error?: string }).error || 'Failed to write file');
    }

    const result = await response.json().catch(() => ({}));
    return {
      success: Boolean((result as { success?: boolean }).success),
      path: typeof (result as { path?: string }).path === 'string' ? normalizePath((result as { path: string }).path) : target,
    };
  },

  async uploadFile(path: string, file: Blob, options): Promise<{ success: boolean; path: string }> {
    const target = normalizePath(path);
    const response = await fetchFiles('/api/fs/upload', {
      method: 'POST',
      query: {
        path: target,
        overwrite: options?.overwrite ? 'true' : undefined,
      },
      headers: {
        'Content-Type': 'application/octet-stream',
        ...directoryHeaders(getDirectory, options?.directory, target),
      },
      body: file,
    });

    if (!response.ok) {
      const error: WebFileMutationResponse = await response.json().catch(() => ({ error: response.statusText }));
      throw new FilesystemError(error.error || 'Failed to upload file', {
        reason: parseFilesystemErrorReason(error.reason),
        status: response.status,
      });
    }

    const result: WebFileMutationResponse = await response.json().catch(() => ({}));
    return {
      success: Boolean(result.success),
      path: result.path ? normalizePath(result.path) : target,
    };
  },

  async delete(path: string): Promise<{ success: boolean }> {
    const target = normalizePath(path);
    const response = await fetchFiles('/api/fs/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...directoryHeaders(getDirectory, undefined, target) },
      body: JSON.stringify({ path: target }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as { error?: string }).error || 'Failed to delete file');
    }

    const result = await response.json().catch(() => ({}));
    return { success: Boolean((result as { success?: boolean }).success) };
  },

  async rename(oldPath: string, newPath: string): Promise<{ success: boolean; path: string }> {
    const response = await fetchFiles('/api/fs/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...directoryHeaders(getDirectory, undefined, oldPath) },
      body: JSON.stringify({ oldPath, newPath }),
    });

    if (!response.ok) {
      const error: WebFileMutationResponse = await response.json().catch(() => ({ error: response.statusText }));
      throw new FilesystemError(error.error || 'Failed to rename file', {
        reason: parseFilesystemErrorReason(error.reason),
        status: response.status,
      });
    }

    const result: WebFileMutationResponse = await response.json().catch(() => ({}));
    return {
      success: Boolean(result.success),
      path: result.path ? normalizePath(result.path) : newPath,
    };
  },

  async revealPath(targetPath: string): Promise<{ success: boolean }> {
    const response = await fetchFiles('/api/fs/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...directoryHeaders(getDirectory, undefined, targetPath) },
      body: JSON.stringify({ path: normalizePath(targetPath) }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as { error?: string }).error || 'Failed to reveal path');
    }

    const result = await response.json().catch(() => ({}));
    return { success: Boolean((result as { success?: boolean }).success) };
  },

  async downloadFile(path: string, options): Promise<void> {
    const target = normalizePath(path);
    const params = new URLSearchParams({ path: target, download: 'true' });
    if (options?.allowOutsideWorkspace) {
      params.set('allowOutsideWorkspace', 'true');
    }
    if (options?.outsideFileGrant) {
      params.set('outsideFileGrant', options.outsideFileGrant);
    }
    const response = await fetchFiles('/api/fs/raw', {
      query: params,
      headers: directoryHeaders(getDirectory, options?.directory, target),
    });
    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`);
    }

    const blob = await response.blob();
    const filename = target.split('/').pop() || 'file';
    const capacitor = (window as typeof window & {
      Capacitor?: { isNativePlatform?: () => boolean };
    }).Capacitor;
    if (capacitor?.isNativePlatform?.() === true) {
      await shareFileFromNativeApp(new File([blob], filename, { type: blob.type || 'application/octet-stream' }));
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  },
  };
};
