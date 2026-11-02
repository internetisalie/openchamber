import { z } from 'zod';
import type { FilesAPI } from '@/lib/api/types';

const memberDirectory = z.string().min(1).refine((value) => !value.includes('\\') && !value.includes('\0')
  && !value.includes(':') && value.split('/').every((part) => Boolean(part) && part !== '.' && part !== '..'));

// Project display data only; identity, seats and steps stay outside the panel's model.
const manifestSchema = z.object({
  version: z.literal(1),
  container: z.string().min(1),
  members: z.array(z.object({
    dir: memberDirectory,
    role: z.enum(['project', 'adjunct', 'base']),
    repo: z.string().min(1),
    pin: z.object({ sha: z.string().regex(/^[a-fA-F0-9]{40}$/), ref: z.string(), branch: z.string() }),
  })).min(2),
}).refine(({ members }) => new Set(members.map((member) => member.dir)).size === members.length
  && members.filter((member) => member.role === 'project').length === 1
  && members.filter((member) => member.role === 'base').length === 1
  && !members.some((member, index) => members.some((other, otherIndex) => index !== otherIndex
    && member.dir.startsWith(`${other.dir}/`))));

type LocationManifest = z.infer<typeof manifestSchema>;
export type LocationManifestState =
  | { status: 'loading' | 'missing' | 'unsupported' | 'invalid' | 'failed' }
  | { status: 'ready'; manifest: LocationManifest };

export async function readLocationManifest(files: FilesAPI, directory: string, signal: AbortSignal): Promise<LocationManifestState> {
  if (!files.readNativeFile) return { status: 'unsupported' };
  let content: string;
  try {
    const result = await files.readNativeFile('.supervisor/manifest.json', { directory, signal });
    if (result.status !== 'read') return result;
    content = result.content;
  } catch {
    return { status: 'failed' };
  }
  try {
    const manifest = manifestSchema.parse(JSON.parse(content));
    if (manifest.container !== directory) return { status: 'invalid' };
    return { status: 'ready', manifest };
  } catch {
    return { status: 'invalid' };
  }
}
