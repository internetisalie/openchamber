import type { Session } from '@/lib/opencode/model';

import { partitionSidebarSessions } from '@/components/session/sidebar/list/sessionCollection';
import { isCapacitorApp } from '@/lib/platform';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';

export const partitionMobileSessions = (
  sessions: readonly Session[],
) => partitionSidebarSessions(sessions, false, !isCapacitorApp());

export const resolveMobileSessionTarget = (session: Session) => ({
  sessionId: session.id,
  directory: resolveGlobalSessionDirectory(session),
});
