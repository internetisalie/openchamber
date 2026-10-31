import { z } from 'zod';
import { FilesystemError } from './files-errors';

export const invalidFileResponse = () => new FilesystemError('Invalid remote file response', {
  status: 503, reason: 'invalid-response',
});

export const changedFileSource = () => new FilesystemError('Remote file source changed', {
  status: 409, reason: 'remote-source-changed',
});

export const fileSourceIdentitySchema = z.string().min(1).refine(
  (value) => new TextEncoder().encode(value).byteLength <= 1024,
);

export function requireFileSourceIdentity(value: string | null | undefined): string {
  const parsed = fileSourceIdentitySchema.safeParse(value);
  if (!parsed.success) throw invalidFileResponse();
  return parsed.data;
}

export function assertFileSourceIdentity(actual: string | null | undefined, expected: string): void {
  if (requireFileSourceIdentity(actual) !== requireFileSourceIdentity(expected)) throw changedFileSource();
}
