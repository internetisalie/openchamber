import path from 'node:path';
import { z } from 'zod';
import {
  REMOTE_FILE_LIMITS,
  RemoteWorkspaceFileError,
  awaitRemoteFileOperation,
  decodeRemoteReadPath,
  remoteFileParameter,
  remoteFileRequest,
  remoteFilesUnavailable,
  remoteRelativePath,
} from './remote-workspace-files.js';

const invalidPath = () => new RemoteWorkspaceFileError(400, 'invalid-path', 'Invalid remote file request');
const remoteWorkspaceResolverSchema = z.object({ resolve: z.instanceof(Function) });
const unsupported = (contentSearch = false) => new RemoteWorkspaceFileError(501, contentSearch ? 'search-unavailable' : 'unsupported', contentSearch ? 'Remote content search is unavailable' : 'This operation is unavailable for remote workspaces');

const booleanParameter = (params, name, fallback) => {
  const value = remoteFileParameter(params, name);
  if (value === undefined) return fallback;
  if (value !== 'true' && value !== 'false') throw invalidPath();
  return value === 'true';
};

const limitParameter = (params, fallback) => {
  const value = remoteFileParameter(params, 'limit');
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw invalidPath();
  return Math.min(Number(value), REMOTE_FILE_LIMITS.results);
};

const allowParameters = (params, names) => {
  const allowed = new Set(['directory', 'location[directory]', 'allowOutsideWorkspace', ...names]);
  for (const name of params.keys()) {
    if (!allowed.has(name)) throw invalidPath();
    remoteFileParameter(params, name);
  }
};

const concernsWorkspaceFiles = (pathname) => (
  /^\/api\/(?:fs|git|projects)(?:\/|$)/i.test(pathname)
  || /^\/api\/openchamber\/directory\/?$/i.test(pathname)
  || /^\/api\/openchamber\/sessions\/[^/]+\/markdown-image-grants\/?$/i.test(pathname)
);

const boundedJson = (res, payload) => {
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > REMOTE_FILE_LIMITS.metadataBytes) {
    throw new RemoteWorkspaceFileError(400, 'result-too-large', 'Remote file metadata exceeds its byte limit');
  }
  return res.json(payload);
};

export const registerRemoteWorkspaceFileRoutes = (app, { remoteWorkspaceFiles } = {}) => {
  if (remoteWorkspaceFiles === undefined) return;
  app.use(async (req, res, next) => {
    const { pathname, params } = remoteFileRequest(req);
    if (!concernsWorkspaceFiles(pathname)) return next();
    const statRequest = /^\/api\/fs\/stat\/?$/i.test(pathname);
    const abort = new AbortController();
    const cleanup = () => {
      clearTimeout(timer);
      req.removeListener('aborted', onAborted);
      res.removeListener('close', onClosed);
      res.removeListener('finish', cleanup);
    };
    const onAborted = () => abort.abort();
    const onClosed = () => { abort.abort(); cleanup(); };
    const timer = setTimeout(() => {
      abort.abort();
      if (res.headersSent && !res.writableFinished) res.destroy();
    }, REMOTE_FILE_LIMITS.deadlineMs);
    req.once('aborted', onAborted);
    res.once('close', onClosed);
    res.once('finish', cleanup);

    let operation;
    let requestedPath;
    let optional = false;
    try {
      if (!remoteWorkspaceResolverSchema.safeParse(remoteWorkspaceFiles).success) throw remoteFilesUnavailable();
      const scope = await awaitRemoteFileOperation(remoteWorkspaceFiles.resolve(req), abort.signal);
      if (scope?.mode === 'local') { cleanup(); return next(); }
      if (scope?.mode !== 'remote') throw remoteFilesUnavailable();
      res.setHeader('Cache-Control', 'no-store');
      if (params.has('outsideFileGrant') || params.has('previewGrant') || booleanParameter(params, 'allowOutsideWorkspace', false)) {
        throw new RemoteWorkspaceFileError(400, 'excluded-path', 'Remote workspace grants are unavailable');
      }
      if (req.method !== 'GET') throw unsupported();
      const route = pathname.toLowerCase().replace(/\/$/, '');
      if (route === '/api/fs/find-in-files') throw unsupported(true);
      const options = { scope, signal: abort.signal };
      const absolute = (allowRoot = false) => {
        requestedPath = remoteFileParameter(params, 'path');
        if (allowRoot && (requestedPath === undefined || requestedPath === '')) requestedPath = scope.directory;
        if (requestedPath === undefined) throw invalidPath();
        return remoteRelativePath(scope.directory, requestedPath, { allowRoot });
      };

      if (route === '/api/fs/list') {
        operation = 'list';
        allowParameters(params, ['path', 'respectGitignore']);
        const relative = absolute(true);
        const result = await awaitRemoteFileOperation(remoteWorkspaceFiles.list({ ...options, path: relative, respectGitignore: booleanParameter(params, 'respectGitignore', false) }), abort.signal);
        const entries = result.entries.map((entry) => ({
          name: path.posix.basename(entry.path), path: path.posix.join(scope.directory, entry.path),
          isDirectory: entry.type === 'directory', isFile: entry.type === 'file', isSymbolicLink: false,
        }));
        return boundedJson(res, { path: requestedPath, entries, sourceIdentity: result.sourceIdentity });
      }

      if (route === '/api/fs/read' || route === '/api/fs/stat' || /^\/api\/fs\/read\//i.test(pathname)) {
        operation = route === '/api/fs/stat' ? 'stat' : 'read';
        optional = booleanParameter(params, 'optional', false);
        if (['download', 'raw', 'binary', 'encoding'].some((key) => params.has(key))) throw unsupported();
        if (/^\/api\/fs\/read\//i.test(pathname) && params.has('path')) throw invalidPath();
        allowParameters(params, ['path', 'optional']);
        const relative = route === '/api/fs/read' || route === '/api/fs/stat'
          ? absolute(operation === 'stat')
          : decodeRemoteReadPath(pathname.slice('/api/fs/read/'.length));
        requestedPath ??= path.posix.join(scope.directory, relative);
        const result = await awaitRemoteFileOperation(remoteWorkspaceFiles[operation]({ ...options, path: relative }), abort.signal);
        if (operation === 'read') {
          res.setHeader('X-OpenChamber-File-Source', result.sourceIdentity);
          return res.type('text/plain').send(result.text);
        }
        return boundedJson(res, { path: requestedPath, ...result, sourceKind: 'remote' });
      }

      if (route === '/api/fs/find' || route === '/api/fs/search') {
        operation = 'find';
        allowParameters(params, ['query', 'type', 'limit', 'includeHidden', 'respectGitignore']);
        const supplemental = route === '/api/fs/search';
        const type = remoteFileParameter(params, 'type') ?? (supplemental ? 'file' : undefined);
        if (type !== undefined && !['file', 'directory'].includes(type)) throw invalidPath();
        const result = await awaitRemoteFileOperation(remoteWorkspaceFiles.find({
          ...options, query: remoteFileParameter(params, 'query') ?? '', type,
          limit: limitParameter(params, supplemental ? 60 : REMOTE_FILE_LIMITS.results),
          includeHidden: booleanParameter(params, 'includeHidden', false),
          respectGitignore: booleanParameter(params, 'respectGitignore', true),
        }), abort.signal);
        if (!supplemental) return boundedJson(res, { location: { directory: scope.directory }, data: result.entries, sourceIdentity: result.sourceIdentity });
        const files = result.entries.map((entry) => ({
          name: path.posix.basename(entry.path), path: path.posix.join(scope.directory, entry.path),
          relativePath: entry.path, extension: path.posix.extname(entry.path),
        }));
        return boundedJson(res, { files, sourceIdentity: result.sourceIdentity });
      }
      throw unsupported();
    } catch (error) {
      abort.abort();
      if (res.destroyed || req.aborted) { cleanup(); return; }
      if (res.headersSent) { res.destroy(); cleanup(); return; }
      if (optional && ['read', 'stat'].includes(operation) && error instanceof RemoteWorkspaceFileError && error.status === 404 && error.kind === 'not-found' && error.sourceIdentity && error.sourceIdentity === error.expectedSourceIdentity) {
        res.setHeader('X-OpenChamber-File-Source', error.sourceIdentity);
        if (operation === 'read') {
          return res.type('text/plain').send('');
        }
        return res.json({ path: requestedPath, exists: false, sourceKind: 'remote', sourceIdentity: error.sourceIdentity });
      }
      const failure = error instanceof RemoteWorkspaceFileError ? error : remoteFilesUnavailable();
      const payload = { error: failure.message, reason: failure.kind };
      if (statRequest) payload.sourceKind = 'remote';
      return res.status(failure.status).json(payload);
    }
  });
};
