import { FilesystemError } from './files-errors';

export const invalidFileResponse = () => new FilesystemError('Invalid remote file response', {
  status: 503, reason: 'invalid-response',
});

export const changedFileSource = () => new FilesystemError('Remote file source changed', {
  status: 409, reason: 'remote-source-changed',
});

export function requireFileSourceIdentity(value: unknown): string {
  if (typeof value !== 'string' || !value.length || new TextEncoder().encode(value).byteLength > 1024) {
    throw invalidFileResponse();
  }
  return value;
}

export function assertFileSourceIdentity(actual: unknown, expected: string): void {
  if (requireFileSourceIdentity(actual) !== requireFileSourceIdentity(expected)) throw changedFileSource();
}
