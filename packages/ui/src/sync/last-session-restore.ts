import { normalizePath } from '@/lib/pathNormalization';
import { getRuntimeKey, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { ensureGlobalSessionsLoaded, refreshGlobalSessions, resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import type { Session } from '@/lib/opencode/model';
import { getAdmissionNavigationRevision, useSessionUIStore } from './session-ui-store';
import { getSessionAdmissionScope } from './session-admission-rule';
import { isSessionAdmitted } from './session-admission';
import { useGlobalSyncStore } from './global-sync-store';
import { clearLastActiveSession, readLastActiveSession } from './last-session-cache';

export type LastSessionRestoreResult =
    /** The session left open last time is selected again. */
    | 'restored'
    /** Nothing to restore: no pointer, the session is gone, or something else was opened meanwhile. */
    | 'none'
    /** The session list could not be read; the pointer is kept for a later attempt. */
    | 'failed';

/**
 * The session load resolves even when the server could not be read (OpenCode
 * still starting, a network error): it then returns the cached or fallback
 * list and marks the store `error`. Only a completed load may say a session is
 * gone.
 */
const isSessionListAuthoritative = (): boolean => {
    const { hasLoaded, status } = useGlobalSessionsStore.getState();
    return hasLoaded && status !== 'error';
};

const loadSessionList = (refresh: boolean) =>
    (refresh ? refreshGlobalSessions() : ensureGlobalSessionsLoaded()).catch(() => null);

const waitForSavedSessionProjects = (session: Session): Promise<void> => new Promise((resolve) => {
    const finish = () => { clearTimeout(timer); stopGlobal(); stopRuntime(); stopSelection(); resolve(); };
    const timer = setTimeout(finish, 6_000);
    const stopGlobal = useGlobalSyncStore.subscribe((state, previous) => {
        if (state.ready || (state.projects !== previous.projects && isSessionAdmitted(resolveGlobalSessionDirectory(session), session))) finish();
    });
    const stopRuntime = subscribeRuntimeEndpointWillChange(finish);
    const revision = getAdmissionNavigationRevision();
    const stopSelection = useSessionUIStore.subscribe(() => {
        if (getAdmissionNavigationRevision() !== revision) finish();
    });
});

/**
 * Reopens the session that was open when the app last closed, on launch.
 *
 * The pointer is written on every session switch and dropped when the user
 * opens a draft themselves (`openNewSessionDraft`), so it names exactly what
 * was on screen at close. The automatic boot draft does not count as a
 * choice and is replaced. Anything opened while the session list loads (a
 * link, a click) wins, as does a user draft, which clears the pointer.
 */
export const restoreLastActiveSession = async (options: {
    /** Read the session list fresh rather than accept one already loaded (mobile reconnects). */
    readonly refresh: boolean;
}): Promise<LastSessionRestoreResult> => {
    if (useSessionUIStore.getState().currentSessionId) return 'none';
    const runtimeKey = getRuntimeKey();
    const persisted = readLastActiveSession(runtimeKey);
    if (!persisted) return 'none';
    const revision = getAdmissionNavigationRevision();

    const snapshot = await loadSessionList(options.refresh);
    // A switch to another instance meanwhile makes this pointer and list foreign.
    if (getRuntimeKey() !== runtimeKey) return 'none';
    if (!snapshot || !isSessionListAuthoritative()) return 'failed';

    let session = snapshot.activeSessions.find((entry) => entry.id === persisted.sessionId);
    if (!session) {
        // The authoritative list says it is gone (deleted or archived): drop
        // the stale pointer instead of retrying it on every launch.
        clearLastActiveSession(runtimeKey);
        return 'none';
    }

    // Registered projects can have workspaces that are only known once the
    // independent OpenCode project bootstrap returns. Wait without adopting
    // any folder, and give an intervening navigation precedence.
    if (!isSessionAdmitted(resolveGlobalSessionDirectory(session), session)
        && getSessionAdmissionScope() !== 'vscode'
        && useProjectsStore.getState().projects.length > 0
        && !useGlobalSyncStore.getState().ready
        && getAdmissionNavigationRevision() === revision) {
        await waitForSavedSessionProjects(session);
        if (getRuntimeKey() !== runtimeKey) return 'none';
        const current = useGlobalSessionsStore.getState().entityById.get(persisted.sessionId);
        // Metadata may have changed while waiting. An archived or deleted
        // session is no longer eligible for launch restore.
        if (!current || current.time?.archived) return 'none';
        session = current;
    }
    const latest = useSessionUIStore.getState();
    if (latest.currentSessionId || getAdmissionNavigationRevision() !== revision || readLastActiveSession(runtimeKey)?.sessionId !== persisted.sessionId) {
        return 'none';
    }
    // Opening a session admits its folder. A launch is not the user's choice,
    // so a session outside every project waits for them to open it.
    if (!isSessionAdmitted(resolveGlobalSessionDirectory(session), session)) return 'none';
    void latest.setCurrentSession(
        session.id,
        resolveGlobalSessionDirectory(session) ?? persisted.directory ?? undefined,
        { keepSingleProject: true },
    );
    return 'restored';
};

type ReopenedSession = { readonly runtimeKey: string; readonly sessionId: string };

/**
 * Selects the last session at once, before the session list confirms it, so
 * the launch never shows the automatic draft first. Needs the session's
 * directory without asking OpenCode: the pointer's own, or the persisted
 * session list's. Returns null when it selected nothing.
 */
const reopenLastActiveSession = (): ReopenedSession | null => {
    const ui = useSessionUIStore.getState();
    if (ui.currentSessionId) return null;
    const runtimeKey = getRuntimeKey();
    const persisted = readLastActiveSession(runtimeKey);
    if (!persisted) return null;
    const cached = useGlobalSessionsStore.getState().entityById.get(persisted.sessionId);
    const directory = persisted.directory ?? (cached ? resolveGlobalSessionDirectory(cached) : null);
    // `setCurrentSession` opens the cached record's folder over the pointer's.
    if (!directory || !isSessionAdmitted((cached ? resolveGlobalSessionDirectory(cached) : null) ?? directory)) return null;
    void ui.setCurrentSession(persisted.sessionId, directory, { keepSingleProject: true });
    return { runtimeKey, sessionId: persisted.sessionId };
};

/**
 * Checks a reopened session against the authoritative session list. A session
 * the list no longer holds (deleted or archived) loses its pointer, and the
 * chat falls back to the draft unless the user has opened something else
 * since. A session that moved directories is reselected in its new one.
 */
const confirmReopenedSession = async (reopened: ReopenedSession, refresh: boolean): Promise<LastSessionRestoreResult> => {
    const snapshot = await loadSessionList(refresh);
    if (getRuntimeKey() !== reopened.runtimeKey) return 'none';
    if (!snapshot || !isSessionListAuthoritative()) return 'failed';

    const latest = useSessionUIStore.getState();
    const stillOpen = latest.currentSessionId === reopened.sessionId;
    const session = snapshot.activeSessions.find((entry) => entry.id === reopened.sessionId);
    if (session) {
        const directory = normalizePath(resolveGlobalSessionDirectory(session));
        if (stillOpen && directory && directory !== latest.currentSessionDirectory) {
            if (!isSessionAdmitted(directory)) {
                void latest.setCurrentSession(null);
                return 'none';
            }
            void latest.setCurrentSession(session.id, directory, { keepSingleProject: latest.currentSessionKeepsSingleProject });
        }
        return 'restored';
    }
    if (readLastActiveSession(reopened.runtimeKey)?.sessionId === reopened.sessionId) {
        clearLastActiveSession(reopened.runtimeKey);
    }
    if (stillOpen) void latest.setCurrentSession(null);
    return 'none';
};

/**
 * Launch restore. The web and desktop shell call it before the chat's first
 * passive effects, which open the automatic draft when nothing is selected;
 * the mobile shell calls it once its instance connects. With `selectNow` it selects the last session at once when its
 * directory is known; otherwise, or without a directory, it waits for the
 * session list as `restoreLastActiveSession` does. Returns the confirmation
 * attempt; `failed` means the session list could not be read yet, and the
 * caller runs the attempt again once startup completes.
 */
export const beginLastSessionRestore = (options: {
    /** False when a route already names a session to open. */
    readonly selectNow: boolean;
    /** Read the session list fresh rather than accept one already loaded (mobile reconnects). */
    readonly refresh: boolean;
}): (() => Promise<LastSessionRestoreResult>) => {
    const reopened = options.selectNow ? reopenLastActiveSession() : null;
    return reopened
        ? () => confirmReopenedSession(reopened, options.refresh)
        : () => restoreLastActiveSession({ refresh: options.refresh });
};
