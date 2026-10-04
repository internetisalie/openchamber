import React from 'react';

import { observeOpenCodePtySessions, type OpenCodePtySessionState } from '@/lib/opencode/pty-observer';
import { useUIStore } from '@/stores/useUIStore';

const EMPTY_STATE: OpenCodePtySessionState = { availability: 'pending', sessions: [], stale: false };

export const useOpenCodePtySessions = (sessionId: string | null, active: boolean) => {
  const showExited = useUIStore((state) => state.showExitedAgentPtys);
  const [snapshot, setSnapshot] = React.useState({ sessionId, state: EMPTY_STATE });

  React.useEffect(() => {
    if (!active || !sessionId) return;
    return observeOpenCodePtySessions(sessionId, (state) => setSnapshot({ sessionId, state }));
  }, [active, sessionId]);

  const state = active && sessionId && snapshot.sessionId === sessionId ? snapshot.state : EMPTY_STATE;
  const sessions = React.useMemo(() => showExited
    ? state.sessions
    : state.sessions.filter((session) => session.status === 'running' || session.status === 'killing'), [showExited, state.sessions]);

  return { state, sessions };
};
