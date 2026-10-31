import { z } from 'zod';

export type FilesystemErrorReason =
  | 'os-permission'
  | 'already-exists'
  | 'not-found'
  | 'not-directory'
  | 'invalid-response'
  | 'invalid-path'
  | 'excluded-path'
  | 'file-too-large'
  | 'directory-limit'
  | 'search-visit-limit'
  | 'non-text'
  | 'result-too-large'
  | 'remote-source-changed'
  | 'remote-unavailable'
  | 'search-unavailable'
  | 'unknown';

export class FilesystemError extends Error {
  readonly reason: FilesystemErrorReason;
  readonly status?: number;

  constructor(message: string, options: { reason?: FilesystemErrorReason; status?: number } = {}) {
    super(message);
    this.name = 'FilesystemError';
    this.reason = options.reason ?? 'unknown';
    this.status = options.status;
  }
}

export const isFilesystemError = (error: unknown): error is FilesystemError => (
  error instanceof FilesystemError
  || Boolean(
    error
    && typeof error === 'object'
    && 'reason' in error
    && typeof error.reason === 'string'
  )
);

export const parseFilesystemErrorReason = (value: unknown): FilesystemErrorReason => {
  switch (value) {
    case 'os-permission':
    case 'already-exists':
    case 'not-found':
    case 'not-directory':
    case 'invalid-response':
    case 'invalid-path':
    case 'excluded-path':
    case 'file-too-large':
    case 'directory-limit':
    case 'search-visit-limit':
    case 'non-text':
    case 'result-too-large':
    case 'remote-source-changed':
    case 'remote-unavailable':
    case 'search-unavailable':
      return value;
    default:
      return 'unknown';
  }
};

// Web rejects with an Error; the VS Code bridge rejects with a plain object
// that carries the message.
const messageCarrierSchema = z.object({ message: z.string() });

export const isFileMissingError = (cause: unknown): boolean => {
  if (isFilesystemError(cause) && (cause.status !== undefined || cause.reason !== 'unknown')) {
    return cause.reason === 'not-found' && (cause.status === undefined || cause.status === 404);
  }
  const carrier = messageCarrierSchema.safeParse(cause);
  const message = cause instanceof Error ? cause.message : carrier.success ? carrier.data.message : String(cause ?? '');
  const normalized = message.toLowerCase();
  return normalized.includes('file not found')
    || normalized.includes('enoent')
    || normalized.includes('no such file')
    || normalized.includes('does not exist');
};
