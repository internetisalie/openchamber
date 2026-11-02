import { z } from 'zod';
import type { FilesAPI } from '@/lib/api/types';
import { isFilesystemError } from '@/lib/api/files-errors';

const DISPATCH_PROJECTION_BYTES = 16 * 1024;
const selector = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const absolutePath = z.string().startsWith('/');
const context = z.object({
  container: absolutePath,
  lane: z.string().regex(/^(loom|glimmer|lunar|r3|sim)\.[a-z][a-z0-9-]{0,31}$/),
  item: z.object({ repository: z.string().min(3), subPath: z.string().min(1), id: z.string().min(1) }).strict().nullable(),
  phase: z.object({ selector: z.string().min(1) }).strict().nullable(),
}).strict();
const base = { schema: z.literal('loom.dispatch-projection.v1'), workspace: absolutePath };
const projection = z.discriminatedUnion('status', [
  z.object({ ...base, status: z.literal('known'), context, sessionID: selector.optional(), agent: selector.optional() }).strict(),
  z.object({ ...base, status: z.literal('legacy-unknown'), sessionID: selector, agent: selector.optional() }).strict(),
  z.object({ ...base, status: z.literal('missing'), sessionID: selector.optional() }).strict(),
]);
type DispatchProjection = z.infer<typeof projection>;
export type DispatchProjectionState = DispatchProjection | {
  status: 'unrequested' | 'loading' | 'unsupported' | 'refused' | 'invalid' | 'failed' | 'stale' | 'cancelled';
};
export type WorkspaceDispatchAttribution = { status: 'unsupported' } | {
  status: 'scoped'; source: string;
  workspaces: ReadonlyMap<string, DispatchProjectionState>;
  sessions: ReadonlyMap<string, DispatchProjectionState>;
};
export const dispatchSessionKey = (directory: string, sessionID: string): string => JSON.stringify([directory, sessionID]);

function hasAmbiguousKeys(text: string): boolean {
  const stack: (Set<string> | null)[] = [];
  for (const token of text.matchAll(/"(?:[^"\\]|\\.)*"|[{}[\]]/g)) {
    const value = token[0];
    if (value === '{' || value === '[') {
      stack.push(value === '{' ? new Set() : null);
      if (stack.length > 32) return true;
    } else if (value === '}' || value === ']') stack.pop();
    else if (text.slice((token.index ?? 0) + value.length).trimStart().startsWith(':')) {
      const keys = stack[stack.length - 1];
      const name: string = JSON.parse(value);
      const folded = name.toLowerCase();
      if (keys?.has(folded)) return true;
      keys?.add(folded);
    }
  }
  return false;
}

export function parseDispatchProjection(text: string, directory: string, sessionID?: string): DispatchProjectionState {
  if (text.length > DISPATCH_PROJECTION_BYTES || new TextEncoder().encode(text).length > DISPATCH_PROJECTION_BYTES) return { status: 'invalid' };
  let input: unknown;
  try {
    input = JSON.parse(text);
    if (hasAmbiguousKeys(text)) return { status: 'invalid' };
  } catch { return { status: 'invalid' }; }
  const marker = z.object({ schema: z.string() }).safeParse(input);
  if (!marker.success || marker.data.schema !== 'loom.dispatch-projection.v1') return { status: 'unsupported' };
  const parsed = projection.safeParse(input);
  if (!parsed.success) return { status: 'invalid' };
  const result = parsed.data;
  if (result.workspace !== directory || result.sessionID !== sessionID) return { status: 'invalid' };
  if ('agent' in result && result.agent !== undefined && !result.sessionID) return { status: 'invalid' };
  return result;
}

export async function readDispatchProjection(files: Pick<FilesAPI, 'readNativeFile'>, directory: string,
  sessionID: string | undefined, signal: AbortSignal, isCurrent: () => boolean): Promise<DispatchProjectionState> {
  const obsolete = (): DispatchProjectionState | null => signal.aborted ? { status: 'cancelled' }
    : !isCurrent() ? { status: 'stale' } : null;
  const before = obsolete();
  if (before) return before;
  if (!directory.startsWith('/') || (sessionID !== undefined && !selector.safeParse(sessionID).success)) return { status: 'invalid' };
  if (!files.readNativeFile) return { status: 'unsupported' };
  const path = sessionID === undefined ? '.supervisor/dispatch-workspace-projection.json'
    : `.supervisor/dispatch-session-projection/${sessionID}.json`;
  try {
    const result = await files.readNativeFile(path, { directory, signal, maxBytes: DISPATCH_PROJECTION_BYTES });
    const after = obsolete();
    if (after) return after;
    return result.status === 'read' ? parseDispatchProjection(result.content, directory, sessionID) : { status: 'unsupported' };
  } catch (error) {
    const after = obsolete();
    if (after) return after;
    if (isFilesystemError(error)) {
      if (error.reason === 'excluded-path' || error.reason === 'os-permission' || error.status === 401 || error.status === 403) return { status: 'refused' };
      if (error.reason === 'remote-source-changed') return { status: 'stale' };
      if (['dispatch-invalid', 'invalid-response', 'invalid-path', 'file-too-large', 'result-too-large', 'non-text'].includes(error.reason)) return { status: 'invalid' };
    }
    return { status: 'failed' };
  }
}

export function workspaceProjection(attribution: WorkspaceDispatchAttribution, source: string, directory: string): DispatchProjectionState {
  return attribution.status === 'scoped' && attribution.source === source
    ? attribution.workspaces.get(directory) ?? { status: 'unrequested' } : { status: 'unsupported' };
}

export function sessionProjection(attribution: WorkspaceDispatchAttribution, source: string, directory: string, sessionID: string): DispatchProjectionState {
  return attribution.status === 'scoped' && attribution.source === source
    ? attribution.sessions.get(dispatchSessionKey(directory, sessionID)) ?? { status: 'unrequested' } : { status: 'unsupported' };
}
