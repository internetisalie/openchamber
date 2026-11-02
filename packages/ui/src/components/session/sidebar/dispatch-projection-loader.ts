import type { FilesAPI } from '@/lib/api/types';
import { dispatchSessionKey, readDispatchProjection, type DispatchProjectionState, type WorkspaceDispatchAttribution } from './dispatch-projection';

const DISPATCH_READ_CONCURRENCY = 2;
const DISPATCH_DIRECTORY_LIMIT = 64;
const DISPATCH_SESSION_LIMIT = 256;
export type DispatchReadTarget = { directory: string; sessionID?: string };

export function planDispatchProjectionReads(sessions: readonly { id: string; directory: string }[]): DispatchReadTarget[] {
  const directories = [...new Set(sessions.map((session) => session.directory).filter((directory) => directory.startsWith('/')))]
    .sort().slice(0, DISPATCH_DIRECTORY_LIMIT);
  const admitted = new Set(directories);
  const byKey = new Map(sessions.filter((session) => admitted.has(session.directory))
    .map((session) => [dispatchSessionKey(session.directory, session.id), session]));
  const historical = [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, DISPATCH_SESSION_LIMIT);
  return [...historical.map(([, session]) => ({ directory: session.directory, sessionID: session.id })),
    ...directories.map((directory) => ({ directory }))];
}

export async function loadDispatchProjections(options: {
  source: string; targets: readonly DispatchReadTarget[]; files: Pick<FilesAPI, 'readNativeFile'>;
  signal: AbortSignal; isCurrent: () => boolean;
}): Promise<WorkspaceDispatchAttribution | null> {
  const workspaces = new Map<string, DispatchProjectionState>();
  const sessions = new Map<string, DispatchProjectionState>();
  const targets = [...new Map(options.targets.map((target) => [
    JSON.stringify([target.directory, target.sessionID ?? null]), target,
  ])).values()];
  let next = 0;
  let sourceChanged = false;
  const current = () => !options.signal.aborted && options.isCurrent();
  const worker = async () => {
    while (next < targets.length && current() && !sourceChanged) {
      const target = targets[next++];
      const result = await readDispatchProjection(options.files, target.directory, target.sessionID, options.signal, current);
      if (!current()) return;
      if (result.status === 'stale') sourceChanged = true;
      if (target.sessionID === undefined) workspaces.set(target.directory, result);
      else sessions.set(dispatchSessionKey(target.directory, target.sessionID), result);
    }
  };
  await Promise.all(Array.from({ length: DISPATCH_READ_CONCURRENCY }, worker));
  if (sourceChanged) {
    workspaces.clear();
    sessions.clear();
    for (const target of targets) {
      if (target.sessionID === undefined) workspaces.set(target.directory, { status: 'stale' });
      else sessions.set(dispatchSessionKey(target.directory, target.sessionID), { status: 'stale' });
    }
  }
  return current() ? { status: 'scoped', source: options.source, workspaces, sessions } : null;
}
