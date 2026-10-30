import { normalizePath } from '@/lib/pathNormalization';
import { useSessionSelector } from '@/sync/sync-context';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { getSessionAdmissionScope, isSessionTargetAdmitted, type SessionAdmissionRecord } from '@/sync/session-admission-rule';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import type { Session } from '@/lib/opencode/model';
import { admitSession } from '@/sync/session-admission';
import { getChatsRoot, subscribeChatsRoot } from '@/lib/chatDirectories';
import { useSpaceArchivesStore } from '@/lib/spaces/space-archives';

type PinnedSelection = { sessionId: string; directory: string | null };

const selectAdmissionRecord = (session: Session | undefined): SessionAdmissionRecord | undefined => session;
const sameAdmissionRecord = (left: SessionAdmissionRecord | undefined, right: SessionAdmissionRecord | undefined): boolean => (
    left?.directory === right?.directory && left?.projectID === right?.projectID
);

/**
 * The directory a pinned chat column reads its session from.
 *
 * OpenCode can move a shown session to another directory (an agent's
 * `session_move`), and `adoptSessionMove` then carries its transcript and live
 * updates to the destination's store. The column follows the session record
 * there; the directory it was opened with would keep it reading a store
 * nothing arrives in. Until the record is known, and while it names the same
 * place, the opened directory stays, so the column keeps its key. The main
 * chat follows a move through `setSessionDirectory` instead.
 */
export const usePinnedSessionDirectory = (selection: PinnedSelection | null): string | null => {
    const liveRecord = useSessionSelector(selection?.sessionId, undefined, selectAdmissionRecord, sameAdmissionRecord);
    const indexedRecord = useGlobalSessionsStore(useShallow((state) => {
        const session = selection ? state.entityById.get(selection.sessionId) : undefined;
        return session ? { directory: session.directory, projectID: session.projectID } : undefined;
    }));
    const record = indexedRecord ?? liveRecord;
    const recordDirectory = record?.directory;
    const openedDirectory = selection?.directory ?? null;
    const directory = !recordDirectory || normalizePath(recordDirectory) === normalizePath(openedDirectory) ? openedDirectory : recordDirectory;
    const projects = useProjectsStore((state) => state.projects);
    const worktrees = useSessionUIStore((state) => state.availableWorktreesByProject);
    // Managed roots can arrive after a pinned selection was restored.
    React.useSyncExternalStore(subscribeChatsRoot, getChatsRoot, getChatsRoot);
    useSpaceArchivesStore((state) => state.byDirectory);
    const admitted = isSessionTargetAdmitted({ directory, session: record }, projects, worktrees, getSessionAdmissionScope());
    const sessionId = selection?.sessionId;
    React.useEffect(() => {
        if (sessionId && directory && !admitted) void admitSession(sessionId, directory, true);
    }, [admitted, directory, sessionId]);
    return admitted ? directory : null;
};
