import type { Session } from '@opencode-ai/sdk/v2';

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
