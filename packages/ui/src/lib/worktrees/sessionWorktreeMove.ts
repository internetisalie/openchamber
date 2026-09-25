import type { Session } from '@/lib/opencode/model';
import type { I18nKey } from '@/lib/i18n';
import { toast } from '@/components/ui';
import { checkIsGitRepository, getGitStatus } from '@/lib/gitApi';
import { normalizePath } from '@/lib/pathNormalization';
import { createQuickWorktree, resolveProjectRef } from '@/lib/worktreeSessionCreator';
import { getLatestWorktreeMetadata, removeProjectWorktree, type ProjectRef } from '@/lib/worktrees/worktreeManager';
import { refreshGlobalSessionsForDirectories, resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';
import { isAmbiguousSendFailure } from '@/sync/send-failure-classification';
import { getSessionLiveActivity, isSessionBusyNow, moveSessionToDirectory } from '@/sync/session-actions';
import { useSessionUIStore } from '@/sync/session-ui-store';
import type { WorktreeMetadata } from '@/types/worktree';
import { waitForWorktreeGitReady } from '@/lib/worktrees/worktreeBootstrap';
import { create } from 'zustand';

export type SessionTreeMoveMessages = {
  success: string;
  failure: string;
  /** Description under the failure toast when the answer was lost and the new worktree was kept. */
  outcomeUnknown: string;
};

export const buildSessionTreeMoveMessages = (
  t: (key: I18nKey) => string,
  keys: { success: I18nKey; failure: I18nKey },
): SessionTreeMoveMessages => ({
  success: t(keys.success),
  failure: t(keys.failure),
  outcomeUnknown: t('sessions.sidebar.session.moveToWorktree.outcomeUnknown'),
});

/** The move request lost its answer after a new worktree was created; the worktree stays. */
export class SessionMoveOutcomeUnknownError extends Error {
  constructor(cause: Error) {
    super(cause.message, { cause });
    this.name = 'SessionMoveOutcomeUnknownError';
  }
}

export type SessionTreeMoveIntent =
  | {
      kind: 'existing';
      root: Session;
      descendants: Session[];
      sourceDirectory: string;
      destination: WorktreeMetadata;
      messages: SessionTreeMoveMessages;
    }
  | {
      kind: 'quick';
      root: Session;
      descendants: Session[];
      sourceDirectory: string;
      messages: SessionTreeMoveMessages;
    };

// OpenCode 2.x `session.move` relocates the session only; uncommitted changes
// stay in the source worktree. v1 could carry them along and asked the user
// which to do, so this module once held a confirmation step. There is nothing
// to choose now, and a move starts as soon as it is requested.
type SessionMoveState = {
  pendingSessionIds: Set<string>;
};

const useSessionMoveState = create<SessionMoveState>(() => ({
  pendingSessionIds: new Set(),
}));

export const useIsSessionWorktreeMovePending = (sessionId: string): boolean =>
  useSessionMoveState((state) => state.pendingSessionIds.has(sessionId));

const setSessionMovePending = (sessionId: string, pending: boolean): void => {
  useSessionMoveState.setState((state) => {
    if (state.pendingSessionIds.has(sessionId) === pending) return state;
    const pendingSessionIds = new Set(state.pendingSessionIds);
    if (pending) pendingSessionIds.add(sessionId);
    else pendingSessionIds.delete(sessionId);
    return { ...state, pendingSessionIds };
  });
};

const resolveSourceBranch = async (directory: string, projectDirectory: string): Promise<string> => {
  try {
    const status = await getGitStatus(directory, { mode: 'light' });
    const currentBranch = status.current?.trim();
    if (currentBranch) return currentBranch;
  } catch {
    // Fall back to discovered worktree metadata below.
  }

  const normalizedDirectory = normalizePath(directory);
  const normalizedProjectDirectory = normalizePath(projectDirectory) ?? projectDirectory;
  const worktrees = useSessionUIStore.getState().availableWorktreesByProject;
  const metadata = (worktrees.get(normalizedProjectDirectory) ?? worktrees.get(projectDirectory) ?? [])
    .find((worktree) => normalizePath(worktree.path) === normalizedDirectory);
  const mappedBranch = metadata?.branch?.trim();
  if (mappedBranch) return mappedBranch;

  throw new Error('Unable to determine the current branch');
};

// Scans every child store instead of the source directory's: a session's live
// status can be reported by a directory other than the one that wins the
// directory dedup, and a directory-scoped read would then see no status at all
// and move a running session.
const assertSessionsIdle = (sessions: Session[]): void => {
  for (const session of sessions) {
    const activity = getSessionLiveActivity(session.id);
    if (activity === 'unknown') throw new Error('Session status is unavailable');
    if (activity === 'active') throw new Error('Session is not idle');
  }
};

type RollbackFailure = {
  sessionId: string;
  error: Error;
};

type SessionMoveSource = {
  session: Session;
  sourceDirectory: string;
};

const captureSessionMoveSource = (session: Session, fallbackDirectory: string): SessionMoveSource => ({
  session,
  sourceDirectory: normalizePath(resolveGlobalSessionDirectory(session)) ?? fallbackDirectory,
});

/** Rollback left sessions in the destination; the toast names them. */
class IncompleteRollbackError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = 'IncompleteRollbackError';
  }
}

const createIncompleteRollbackError = (moveError: Error, rollbackFailures: RollbackFailure[]): Error => {
  const rollbackSummary = rollbackFailures
    .map(({ sessionId, error }) => `${sessionId}: ${error.message}`)
    .join(', ');
  return new IncompleteRollbackError(
    `Session move partially failed and could not be fully rolled back: ${moveError.message}. Rollback failures: ${rollbackSummary}`,
    { moveError, rollbackFailures },
  );
};

const rollbackMovedSessions = async (
  moves: SessionMoveSource[],
  worktreeDirectory: string,
  previousMetadata: ReadonlyMap<string, WorktreeMetadata | undefined>,
): Promise<RollbackFailure[]> => {
  const failures: RollbackFailure[] = [];
  for (const { session, sourceDirectory } of [...moves].reverse()) {
    if (isSessionBusyNow(session.id)) {
      failures.push({ sessionId: session.id, error: new Error('Session is not idle') });
      continue;
    }
    try {
      await moveSessionToDirectory(session, worktreeDirectory, sourceDirectory);
      useSessionUIStore.getState().setWorktreeMetadata(session.id, previousMetadata.get(session.id) ?? null);
    } catch (error) {
      failures.push({
        sessionId: session.id,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }
  return failures;
};

const removeFailedWorktree = async (
  project: ProjectRef,
  worktree: WorktreeMetadata,
  moveError: Error,
): Promise<never> => {
  try {
    await removeProjectWorktree(project, worktree, { deleteLocalBranch: true });
  } catch {
    throw new Error(`Session move failed and the new worktree could not be removed: ${moveError.message}`);
  }
  throw moveError;
};

const refreshMovedDirectories = async (sourceDirectories: readonly string[], destinationDirectory: string | undefined): Promise<void> => {
  const directories = Array.from(new Set([
    ...sourceDirectories,
    ...(destinationDirectory ? [destinationDirectory] : []),
  ]));
  try {
    await refreshGlobalSessionsForDirectories(directories);
  } catch (error) {
    // Direct action updates already reconciled both stores. Keep the outcome
    // unchanged if this best-effort authoritative refresh is unavailable.
    console.warn('[session-worktree-move] Failed to refresh moved sessions', error);
  }
};

const moveSessionTreeTransaction = async (
  input: {
    root: Session;
    descendants: Session[];
    sourceDirectory: string;
  },
  prepareDestination: () => Promise<{
    directory: string;
    metadata: WorktreeMetadata;
    onMoveFailure?: (error: Error) => Promise<never>;
  }>,
): Promise<string> => {
  if (useSessionMoveState.getState().pendingSessionIds.has(input.root.id)) {
    throw new Error('Session move already in progress');
  }
  setSessionMovePending(input.root.id, true);

  try {
    const sessions = [...input.descendants, input.root];
    const sessionMoves = sessions.map((session) => captureSessionMoveSource(session, input.sourceDirectory));
    const sourceDirectories = Array.from(new Set([
      input.sourceDirectory,
      ...sessionMoves.map((move) => move.sourceDirectory),
    ]));
    const previousMetadata = new Map(
      sessions.map((session) => [
        session.id,
        useSessionUIStore.getState().getWorktreeMetadata(session.id),
      ]),
    );
    assertSessionsIdle(sessions);

    let destination: Awaited<ReturnType<typeof prepareDestination>> | null = null;
    const moved: SessionMoveSource[] = [];
    let ambiguousSessionMove: SessionMoveSource | null = null;
    try {
      destination = await prepareDestination();
      for (const [index, move] of sessionMoves.entries()) {
        const { session, sourceDirectory } = move;
        // Setup and earlier moves can take long enough for a not-yet-moved
        // session to start running, so re-check the remaining source tree
        // immediately before each move. The root moves last.
        assertSessionsIdle(sessions.slice(index));
        try {
          await moveSessionToDirectory(session, sourceDirectory, destination.directory);
        } catch (error) {
          // The server may have moved the session before an ambiguous response
          // was lost. Reverse that move along with earlier completed moves.
          if (isAmbiguousSendFailure(error)) {
            ambiguousSessionMove = move;
          }
          throw error;
        }
        moved.push(move);
        if (session.id === input.root.id) continue;
        useSessionUIStore.getState().setWorktreeMetadata(session.id, getLatestWorktreeMetadata(destination.metadata));
      }
    } catch (error) {
      const moveError = error instanceof Error ? error : new Error(String(error));
      const rollbackFailures = await rollbackMovedSessions(
        ambiguousSessionMove ? [...moved, ambiguousSessionMove] : moved,
        destination?.directory ?? input.sourceDirectory,
        previousMetadata,
      );
      if (ambiguousSessionMove) {
        // The move request may have completed server-side, so the session's
        // directory is unknown too. Reconcile both directories now instead of
        // letting the sidebar contradict the toast until the next poll.
        await refreshMovedDirectories(sourceDirectories, destination?.directory);
      }
      if (rollbackFailures.length > 0) {
        const incomplete = createIncompleteRollbackError(moveError, rollbackFailures);
        if (ambiguousSessionMove && destination?.onMoveFailure) {
          throw new SessionMoveOutcomeUnknownError(incomplete);
        }
        throw incomplete;
      }
      // A successful reverse move returns every affected session to its
      // captured source, so a newly created destination can be removed.
      if (destination?.onMoveFailure) {
        return destination.onMoveFailure(moveError);
      }
      throw moveError;
    }
    useSessionUIStore.getState().setWorktreeMetadata(input.root.id, getLatestWorktreeMetadata(destination.metadata));

    await refreshMovedDirectories(sourceDirectories, destination.directory);
    return destination.directory;
  } finally {
    setSessionMovePending(input.root.id, false);
  }
};

export const moveSessionTreeToExistingWorktree = async (input: {
  root: Session;
  descendants: Session[];
  sourceDirectory: string;
  destination: WorktreeMetadata;
}): Promise<string> => {
  const normalizedSourceDirectory = normalizePath(input.sourceDirectory) ?? input.sourceDirectory;
  const normalizedDestinationDirectory = normalizePath(input.destination.path) ?? input.destination.path;
  if (normalizedSourceDirectory === normalizedDestinationDirectory) {
    throw new Error('Source and destination are the same');
  }
  if (input.destination.worktreeStatus !== 'ready') {
    throw new Error('Destination worktree is not ready');
  }

  return moveSessionTreeTransaction(input, async () => ({
    directory: input.destination.path,
    metadata: input.destination,
  }));
};

const moveSessionTreeToQuickWorktree = async (input: {
  root: Session;
  descendants: Session[];
  sourceDirectory: string;
}): Promise<string> => {
  return moveSessionTreeTransaction(input, async () => {
    const project = resolveProjectRef(input.sourceDirectory);
    if (!project) throw new Error('Unable to find the project for this session');

    const sourceBranch = await checkIsGitRepository(input.sourceDirectory)
      ? await resolveSourceBranch(input.sourceDirectory, project.path)
      : null;
    const worktree = await createQuickWorktree(project, sourceBranch ? { startRef: sourceBranch } : {});
    try {
      await waitForWorktreeGitReady(worktree.path);
    } catch (error) {
      const setupError = error instanceof Error ? error : new Error(String(error));
      return removeFailedWorktree(project, worktree, setupError);
    }
    return {
      directory: worktree.path,
      metadata: worktree,
      // removeFailedWorktree force-deletes the worktree and its branch; the
      // session's files never move, so nothing of the user's is in it yet.
      // Called after all completed or ambiguous moves have been reversed.
      onMoveFailure: async (error) => removeFailedWorktree(project, worktree, error),
    };
  });
};

const executeSessionTreeMove = (intent: SessionTreeMoveIntent): void => {
  const movePromise = intent.kind === 'existing'
    ? moveSessionTreeToExistingWorktree({
        root: intent.root,
        descendants: intent.descendants,
        sourceDirectory: intent.sourceDirectory,
        destination: intent.destination,
      })
    : moveSessionTreeToQuickWorktree({
        root: intent.root,
        descendants: intent.descendants,
        sourceDirectory: intent.sourceDirectory,
      });

  void movePromise
    .then(() => toast.success(intent.messages.success))
    .catch((error) => {
      const failure = error instanceof Error ? error : new Error(String(error));
      toast.error(intent.messages.failure, {
        description: failure instanceof SessionMoveOutcomeUnknownError
          ? `${intent.messages.outcomeUnknown} ${failure.message}`
          : failure.message,
      });
    });
};

export const requestSessionTreeMove = (intent: SessionTreeMoveIntent): void => {
  if (useSessionMoveState.getState().pendingSessionIds.has(intent.root.id)) return;
  executeSessionTreeMove(intent);
};
