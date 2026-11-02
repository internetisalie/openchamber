import path from 'node:path';
import { validateHeaderValue } from 'node:http';
import { z } from 'zod';

export const REMOTE_FILE_LIMITS = Object.freeze({ fileBytes: 1048576, metadataBytes: 1048576, errorBytes: 65536, sourceIdentityBytes: 1024, entries: 1000, results: 100, deadlineMs: 5000 });

const nonblankStringSchema = z.string().refine((value) => value.trim().length > 0);
const remoteScopeSchema = z.object({ mode: z.literal('remote'), workspaceID: nonblankStringSchema, directory: z.string() });
const logicalRootSchema = z.string().refine((value) => value.startsWith('/') && !value.includes('\\') && !value.includes('\0'));
const relativePathSchema = z.string().min(1).refine((value) => !value.startsWith('/') && !value.includes('\\') && !value.includes('\0')
  && value.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..'));
const sourceIdentitySchema = nonblankStringSchema.refine((value) => Buffer.byteLength(value, 'utf8') <= REMOTE_FILE_LIMITS.sourceIdentityBytes);
const responseSchema = z.object({ status: z.number().int(), headers: z.object({ get: z.instanceof(Function) }) });
const readableBodySchema = z.object({ getReader: z.instanceof(Function) });
const metadataEnvelopeSchema = z.object({ location: z.object({ directory: z.string() }), sourceIdentity: sourceIdentitySchema, data: z.unknown() });
const statDataSchema = z.object({
  path: z.string(), exists: z.literal(true), isFile: z.boolean(),
  isSymbolicLink: z.literal(false).optional(), size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), mtimeMs: z.number().finite(),
});
const entrySchema = z.object({
  path: relativePathSchema, type: z.enum(['file', 'directory']), isSymbolicLink: z.literal(false).optional(),
  name: z.string().optional(), sourceIdentity: sourceIdentitySchema.optional(),
  location: z.object({ directory: z.string() }).optional(), isFile: z.boolean().optional(), isDirectory: z.boolean().optional(),
});
const entriesSchema = z.array(entrySchema);
const entryCollectionSchema = z.array(z.unknown());

export class RemoteWorkspaceFileError extends Error {
  constructor(status, kind, message) {
    super(message);
    this.status = status;
    this.kind = kind;
  }
}

const invalidResponse = () => new RemoteWorkspaceFileError(503, 'invalid-response', 'Invalid remote file response');
const invalidPath = () => new RemoteWorkspaceFileError(400, 'invalid-path', 'Invalid remote workspace path or selector');
export const remoteFilesUnavailable = () => new RemoteWorkspaceFileError(503, 'remote-unavailable', 'Remote workspace files are unavailable');

const cancelResponse = (response) => {
  try { void response.body?.cancel().catch(() => {}); } catch {}
};

const scalar = (params, key) => {
  const values = params.getAll(key);
  if (values.length > 1) throw invalidPath();
  return values.length ? values[0] : undefined;
};

export const remoteFileRequest = (req) => {
  const raw = (req.originalUrl || req.url || '').replace(/^[a-z][a-z\d+.-]*:\/\/[^/?#]*/i, '');
  const separator = raw.indexOf('?');
  return { pathname: separator < 0 ? raw : raw.slice(0, separator), params: new URLSearchParams(separator < 0 ? '' : raw.slice(separator + 1)) };
};

export const remoteFileParameter = scalar;

export const canonicalRemoteRoot = (value) => {
  const parsed = logicalRootSchema.safeParse(value);
  if (!parsed.success) throw invalidPath();
  const root = parsed.data === '/' ? '/' : parsed.data.replace(/\/+$/, '');
  if (root !== '/' && root.slice(1).split('/').some((part) => !part || part === '.' || part === '..')) throw invalidPath();
  return root;
};

const relativePath = (value, allowRoot = false) => {
  if (allowRoot && (value === '' || value === '.')) return '';
  const parsed = relativePathSchema.safeParse(value);
  if (!parsed.success) throw invalidPath();
  return parsed.data;
};

export const remoteRelativePath = (root, value, { absolute = true, allowRoot = false } = {}) => {
  if (!absolute) return relativePath(value, allowRoot);
  const target = canonicalRemoteRoot(value);
  if (!allowRoot && value.endsWith('/')) throw invalidPath();
  if (target === root) return relativePath('', allowRoot);
  const prefix = root === '/' ? '/' : `${root}/`;
  if (!target.startsWith(prefix)) throw invalidPath();
  return relativePath(target.slice(prefix.length), allowRoot);
};

export const decodeRemoteReadPath = (encoded) => {
  try {
    const segments = encoded.split('/').map((part) => {
      const decoded = decodeURIComponent(part);
      if (decoded.includes('/')) throw invalidPath();
      return decoded;
    });
    return relativePath(segments.join('/'));
  } catch {
    throw invalidPath();
  }
};

export const remoteWorkspaceDirectorySelectors = (req) => {
  const { params } = remoteFileRequest(req);
  const selectors = [scalar(params, 'directory'), scalar(params, 'location[directory]')].filter((value) => value !== undefined);
  const header = req.get?.('x-opencode-directory');
  const encoding = req.get?.('x-opencode-directory-encoding');
  const rawHeaders = req.rawHeaders || [];
  for (const key of ['x-opencode-directory', 'x-opencode-directory-encoding']) {
    let count = 0;
    for (let index = 0; index < rawHeaders.length; index += 2) if (rawHeaders[index].toLowerCase() === key) count++;
    if (count > 1) throw invalidPath();
  }
  const hasEncoding = encoding !== undefined && encoding !== null;
  if (hasEncoding && encoding !== 'uri') throw invalidPath();
  if (hasEncoding && !header) throw invalidPath();
  if (header !== undefined && header !== null) {
    const parsed = z.string().safeParse(header);
    if (!parsed.success) throw invalidPath();
    try {
      selectors.push(hasEncoding || !parsed.data.startsWith('/') ? decodeURIComponent(parsed.data) : parsed.data);
    } catch { throw invalidPath(); }
  }
  const roots = selectors.map(canonicalRemoteRoot);
  if (!roots.length || roots.some((value) => value !== roots[0])) throw invalidPath();
  return roots;
};

const validateRemoteScope = (req, scope) => {
  if (scope?.mode === 'local') return scope;
  const parsed = remoteScopeSchema.safeParse(scope);
  if (!parsed.success) throw remoteFilesUnavailable();
  const root = canonicalRemoteRoot(parsed.data.directory);
  if (remoteWorkspaceDirectorySelectors(req).some((value) => value !== root)) throw invalidPath();
  return { mode: 'remote', workspaceID: parsed.data.workspaceID, directory: root };
};

const remoteFileSourceIdentity = (value) => {
  const parsed = sourceIdentitySchema.safeParse(value);
  if (!parsed.success) throw invalidResponse();
  try { validateHeaderValue('X-OpenChamber-File-Source', parsed.data); } catch { throw invalidResponse(); }
  return parsed.data;
};

export const awaitRemoteFileOperation = (operation, signal) => {
  if (signal.aborted) return Promise.reject(remoteFilesUnavailable());
  return new Promise((resolve, reject) => {
    const abort = () => reject(remoteFilesUnavailable());
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(operation).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
};

const readBytes = async (response, limit, kind, signal) => {
  if (response.body === null) return Buffer.alloc(0);
  if (!readableBodySchema.safeParse(response.body).success) throw invalidResponse();
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  let finished = false;
  try {
    while (true) {
      const chunk = await awaitRemoteFileOperation(reader.read(), signal);
      if (chunk.done) { finished = true; break; }
      if (!(chunk.value instanceof Uint8Array)) throw invalidResponse();
      bytes += chunk.value.byteLength;
      if (bytes > limit) throw new RemoteWorkspaceFileError(400, kind, 'Remote file response exceeds its byte limit');
      chunks.push(Buffer.from(chunk.value));
    }
    return Buffer.concat(chunks, bytes);
  } finally {
    if (!finished) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
};

const utf8 = (bytes) => {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { throw invalidResponse(); }
};

const jsonResponse = async (response, limit, signal) => {
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers?.get('content-type') || '')) {
    cancelResponse(response);
    throw invalidResponse();
  }
  const bytes = await readBytes(response, limit, 'result-too-large', signal);
  try { return JSON.parse(utf8(bytes)); } catch { throw invalidResponse(); }
};

const errorKinds = new Map([
  [400, { tag: 'InvalidRequestError', kinds: ['invalid-path', 'excluded-path', 'dispatch-invalid', 'not-directory', 'file-too-large', 'directory-limit', 'search-visit-limit', 'non-text', 'result-too-large'] }],
  [404, { tag: 'FileNotFoundError', kinds: ['not-found'] }],
  [409, { tag: 'ConflictError', kinds: ['remote-source-changed'] }],
  [503, { tag: 'ServiceUnavailableError', kinds: ['remote-unavailable', 'invalid-response'] }],
]);

const sourceChanged = () => new RemoteWorkspaceFileError(409, 'remote-source-changed', 'Remote workspace source changed during the file request');

const checkStatus = async (response, signal, expectedSourceIdentity) => {
  if (!responseSchema.safeParse(response).success) throw invalidResponse();
  if (response.status === 200) return;
  const specification = errorKinds.get(response.status);
  if (!specification) {
    cancelResponse(response);
    if (response.status < 400 || response.status > 599) throw invalidResponse();
    throw new RemoteWorkspaceFileError(response.status, 'remote-unavailable', 'Remote file request was refused');
  }
  const parsed = z.object({ _tag: z.literal(specification.tag), kind: z.enum(specification.kinds), message: z.string().min(1) })
    .safeParse(await jsonResponse(response, REMOTE_FILE_LIMITS.errorBytes, signal));
  if (!parsed.success) throw invalidResponse();
  const payload = parsed.data;
  const error = new RemoteWorkspaceFileError(response.status, payload.kind, payload.message);
  const identity = response.headers?.get('x-openchamber-file-source');
  if (identity !== null && identity !== undefined) error.sourceIdentity = remoteFileSourceIdentity(identity);
  error.expectedSourceIdentity = expectedSourceIdentity;
  if (expectedSourceIdentity && error.sourceIdentity && error.sourceIdentity !== expectedSourceIdentity) throw sourceChanged();
  throw error;
};

const checkEnvelope = (payload, scope, headers) => {
  const parsed = metadataEnvelopeSchema.safeParse(payload);
  if (!parsed.success || parsed.data.location.directory !== scope.directory) throw invalidResponse();
  const identity = remoteFileSourceIdentity(parsed.data.sourceIdentity);
  const header = headers?.get('x-openchamber-file-source');
  if (header !== undefined && header !== null && remoteFileSourceIdentity(header) !== identity) throw invalidResponse();
  if (scope.sourceIdentity && scope.sourceIdentity !== identity) throw sourceChanged();
  return { data: parsed.data.data, sourceIdentity: identity };
};

const statResult = (payload, scope, relative, headers) => {
  const envelope = checkEnvelope(payload, scope, headers);
  const sourceIdentity = envelope.sourceIdentity;
  const parsed = statDataSchema.safeParse(envelope.data);
  if (!parsed.success || parsed.data.path !== relative) throw invalidResponse();
  const data = parsed.data;
  return { isFile: data.isFile, isDirectory: !data.isFile, size: data.size, mtimeMs: data.mtimeMs, sourceIdentity };
};

const entryPath = (entry, scope, sourceIdentity) => {
  const relative = entry.path;
  if (entry.name !== undefined && entry.name !== path.posix.basename(relative)) throw invalidResponse();
  if (entry.sourceIdentity !== undefined && entry.sourceIdentity !== sourceIdentity) throw invalidResponse();
  if (entry.location !== undefined && entry.location?.directory !== scope.directory) throw invalidResponse();
  if (entry.isFile !== undefined && entry.isFile !== (entry.type === 'file')) throw invalidResponse();
  if (entry.isDirectory !== undefined && entry.isDirectory !== (entry.type === 'directory')) throw invalidResponse();
  return relative;
};

export const createRemoteWorkspaceFiles = ({ resolve, buildOpenCodeUrl, getOpenCodeAuthHeaders, fetchImpl = fetch }) => {
  if (!z.instanceof(Function).safeParse(resolve).success) throw new TypeError('Remote workspace authority resolver is required');
  const request = async (scope, operation, params, signal, file) => {
    const query = new URLSearchParams({ 'location[directory]': scope.directory, ...params });
    const endpoint = file === undefined ? `/api/fs/${operation}` : `/api/fs/read/${file.split('/').map(encodeURIComponent).join('/')}`;
    let response;
    try {
      response = await awaitRemoteFileOperation(fetchImpl(buildOpenCodeUrl(`${endpoint}?${query}`), {
        method: 'GET', headers: { ...getOpenCodeAuthHeaders(), Accept: operation === 'read' ? 'text/plain' : 'application/json' },
        redirect: 'error', signal,
      }), signal);
    } catch (error) {
      if (error instanceof RemoteWorkspaceFileError) throw error;
      throw remoteFilesUnavailable();
    }
    await checkStatus(response, signal, scope.sourceIdentity);
    return response;
  };

  const pinSource = async (scope, signal) => {
    const response = await request(scope, 'stat', { path: '' }, signal);
    const payload = await jsonResponse(response, REMOTE_FILE_LIMITS.metadataBytes, signal);
    const root = statResult(payload, scope, '', response.headers);
    if (root.isFile) throw invalidResponse();
    return { scope: { ...scope, sourceIdentity: root.sourceIdentity }, root };
  };

  return {
    resolve: async (req) => validateRemoteScope(req, await resolve(req)),
    list: async ({ scope, path: relative, respectGitignore, signal }) => {
      scope = (await pinSource(scope, signal)).scope;
      const response = await request(scope, 'list', { path: relative, respectGitignore: String(respectGitignore) }, signal);
      const payload = await jsonResponse(response, REMOTE_FILE_LIMITS.metadataBytes, signal);
      const envelope = checkEnvelope(payload, scope, response.headers);
      const sourceIdentity = envelope.sourceIdentity;
      const collection = entryCollectionSchema.safeParse(envelope.data);
      if (!collection.success) throw invalidResponse();
      if (collection.data.length > REMOTE_FILE_LIMITS.entries) throw new RemoteWorkspaceFileError(400, 'directory-limit', 'Remote directory exceeds its entry limit');
      const parsed = entriesSchema.safeParse(collection.data);
      if (!parsed.success) throw invalidResponse();
      const seen = new Set();
      const entries = parsed.data.map((entry) => {
        const value = entryPath(entry, scope, sourceIdentity);
        const parent = path.posix.dirname(value);
        if ((parent === '.' ? '' : parent) !== relative || seen.has(value)) throw invalidResponse();
        seen.add(value);
        return { path: value, type: entry.type };
      });
      return { entries, sourceIdentity };
    },
    find: async ({ scope, query, type, limit, includeHidden, respectGitignore, signal }) => {
      scope = (await pinSource(scope, signal)).scope;
      const params = { query, limit: String(limit), includeHidden: String(includeHidden), respectGitignore: String(respectGitignore) };
      if (type !== undefined) params.type = type;
      const response = await request(scope, 'find', params, signal);
      const payload = await jsonResponse(response, REMOTE_FILE_LIMITS.metadataBytes, signal);
      const envelope = checkEnvelope(payload, scope, response.headers);
      const sourceIdentity = envelope.sourceIdentity;
      const collection = entryCollectionSchema.safeParse(envelope.data);
      if (!collection.success || collection.data.length > limit) throw invalidResponse();
      const parsed = entriesSchema.safeParse(collection.data);
      if (!parsed.success) throw invalidResponse();
      const seen = new Set();
      const entries = parsed.data.map((entry) => {
        const value = entryPath(entry, scope, sourceIdentity);
        if (seen.has(value) || (type !== undefined && entry.type !== type)) throw invalidResponse();
        seen.add(value);
        return { path: value, type: entry.type };
      });
      return { entries, sourceIdentity };
    },
    read: async ({ scope, path: relative, signal }) => {
      scope = (await pinSource(scope, signal)).scope;
      const response = await request(scope, 'read', {}, signal, relative);
      const sourceIdentity = remoteFileSourceIdentity(response.headers?.get('x-openchamber-file-source'));
      if (sourceIdentity !== scope.sourceIdentity) throw sourceChanged();
      if (!/^text\/plain(?:\s*;|$)/i.test(response.headers?.get('content-type') || '')) throw invalidResponse();
      const text = utf8(await readBytes(response, REMOTE_FILE_LIMITS.fileBytes, 'file-too-large', signal));
      return { text, sourceIdentity };
    },
    stat: async ({ scope, path: relative, signal }) => {
      const pinned = await pinSource(scope, signal);
      if (relative === '') return pinned.root;
      const response = await request(pinned.scope, 'stat', { path: relative }, signal);
      const payload = await jsonResponse(response, REMOTE_FILE_LIMITS.metadataBytes, signal);
      return statResult(payload, pinned.scope, relative, response.headers);
    },
  };
};
