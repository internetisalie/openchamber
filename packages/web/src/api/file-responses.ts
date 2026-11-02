import { z } from 'zod';
import { FilesystemError, parseFilesystemErrorReason } from '@openchamber/ui/lib/api/files-errors';
import { changedFileSource, invalidFileResponse } from '@openchamber/ui/lib/api/file-source';
import { getRuntimeKey, subscribeRuntimeEndpointWillChange } from '@openchamber/ui/lib/runtime-switch';

export const FILE_JSON_BYTES = 1024 * 1024;
export const FILE_ERROR_BYTES = 64 * 1024;
export const FILE_SOURCE_HEADER = 'X-OpenChamber-File-Source';

export interface FileRequestRuntime {
  getRuntimeKey: typeof getRuntimeKey;
  subscribeRuntimeEndpointWillChange: (callback: (detail: { runtimeKey: string; previousRuntimeKey: string }) => void) => () => void;
}

const fileRequestRuntime: FileRequestRuntime = { getRuntimeKey, subscribeRuntimeEndpointWillChange };

export const fileErrorResponseSchema = z.object({
  error: z.string().optional().catch(undefined),
  reason: z.string().optional().catch(undefined),
  sourceKind: z.string().optional().catch(undefined),
});

export function createFileRequestScope(signal?: AbortSignal, remote = true, runtime = fileRequestRuntime) {
  const controller = new AbortController();
  const runtimeKey = runtime.getRuntimeKey();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = remote ? setTimeout(() => controller.abort(new FilesystemError('File request timed out', {
    status: 503, reason: 'remote-unavailable',
  })), 5_000) : undefined;
  const unsubscribe = remote ? runtime.subscribeRuntimeEndpointWillChange((detail) => {
    if (detail.runtimeKey !== detail.previousRuntimeKey) controller.abort(changedFileSource());
  }) : () => {};
  const check = () => {
    controller.signal.throwIfAborted();
    if (remote && runtimeKey !== runtime.getRuntimeKey()) throw changedFileSource();
  };
  return {
    signal: controller.signal,
    check,
    async wait<T>(operation: Promise<T>): Promise<T> {
      const pending = Promise.resolve(operation);
      try { check(); } catch (error) { void pending.catch(() => {}); throw error; }
      let onAbort!: () => void;
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener('abort', onAbort, { once: true });
        if (controller.signal.aborted) onAbort();
      });
      try {
        const result = await Promise.race([pending, aborted]);
        check();
        return result;
      } finally {
        controller.signal.removeEventListener('abort', onAbort);
      }
    },
    dispose() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      unsubscribe();
    },
  };
}

export type FileRequestScope = ReturnType<typeof createFileRequestScope>;

export async function readFileResponseText(response: Response, scope: FileRequestScope, maxBytes: number): Promise<string> {
  if (!response.body) { scope.check(); return ''; }
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel(scope.signal.reason).catch(() => {}); };
  scope.signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await scope.wait(reader.read());
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => {});
        throw invalidFileResponse();
      }
      chunks.push(next.value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    scope.check();
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body); }
    catch { throw invalidFileResponse(); }
  } finally {
    scope.signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

export async function readFileResponseJSON<T>(response: Response, scope: FileRequestScope, schema: z.ZodType<T>, maxBytes = FILE_JSON_BYTES): Promise<T> {
  const text = await readFileResponseText(response, scope, maxBytes);
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    if (!parsed.success) throw invalidFileResponse();
    return parsed.data;
  }
  catch { throw invalidFileResponse(); }
}

export async function fileResponseError(response: Response, scope: FileRequestScope): Promise<FilesystemError> {
  let payload: z.infer<typeof fileErrorResponseSchema>;
  try {
    payload = await readFileResponseJSON(response, scope, fileErrorResponseSchema, FILE_ERROR_BYTES);
  } catch (error) {
    scope.check();
    if (!(error instanceof FilesystemError)) throw error;
    return new FilesystemError('Invalid file error response', { status: response.status, reason: 'invalid-response' });
  }
  return new FilesystemError(payload.error ?? (response.statusText || 'File request failed'), {
    status: response.status, reason: parseFilesystemErrorReason(payload.reason),
  });
}
