import React from 'react';

import { useI18n } from '@/lib/i18n';
import { observeOpenCodePtySessions, type OpenCodePtySessionState } from '@/lib/opencode/pty-observer';
import type { OpenCodePtySession } from '@/lib/opencode/pty-bridge';
import { WorkStatusCollapsibleSection, WorkStatusRow, WorkStatusValue } from './WorkStatusPrimitives';
import { useReportWorkStatusPresence } from './presenceContext';
import { OpenCodePtyOutputDialog } from './OpenCodePtyOutputDialog';

const SECTION_ID = 'ptys';
const EMPTY_STATE: OpenCodePtySessionState = { availability: 'pending', sessions: [], stale: false };

type Props = {
  sessionId: string | null;
  active: boolean;
};

const statusKey = (status: OpenCodePtySession['status']) => {
  if (status === 'running') return 'chat.workStatus.pty.running' as const;
  if (status === 'killing') return 'chat.workStatus.pty.stopping' as const;
  return 'chat.workStatus.pty.exited' as const;
};

export const WorkStatusPtySection: React.FC<Props> = ({ sessionId, active }) => {
  const { t } = useI18n();
  const [state, setState] = React.useState<OpenCodePtySessionState>(EMPTY_STATE);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSelectedId(null);
    if (!active || !sessionId) {
      setState(EMPTY_STATE);
      return;
    }
    return observeOpenCodePtySessions(sessionId, setState);
  }, [active, sessionId]);

  const selected = state.sessions.find((session) => session.id === selectedId) ?? null;
  React.useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selected, selectedId]);

  const present = Boolean(sessionId) && state.availability !== 'absent';
  useReportWorkStatusPresence(SECTION_ID, present);
  if (!present) return null;

  let body: React.ReactNode;
  if (state.availability === 'pending') {
    body = <WorkStatusRow label={t('common.loading')} muted />;
  } else if (state.availability === 'authentication-error') {
    body = <WorkStatusRow label={t('chat.workStatus.pty.authenticationError')} value={<WorkStatusValue tone="error">!</WorkStatusValue>} />;
  } else if (state.availability === 'unknown') {
    body = <WorkStatusRow label={t('chat.workStatus.pty.availabilityUnknown')} value={<WorkStatusValue tone="warning">!</WorkStatusValue>} />;
  } else if (state.sessions.length === 0) {
    body = <WorkStatusRow label={t('chat.workStatus.pty.none')} muted />;
  } else {
    body = (
      <>
        {state.sessions.map((session) => (
          <WorkStatusRow
            key={session.id}
            icon="terminal"
            label={session.title}
            value={(
              <WorkStatusValue tone={session.status === 'running' ? 'success' : session.status === 'killing' ? 'warning' : 'muted'}>
                {t(statusKey(session.status))}
              </WorkStatusValue>
            )}
            onClick={() => setSelectedId(session.id)}
            ariaLabel={t('chat.workStatus.pty.openOutput', { name: session.title })}
          />
        ))}
        {state.stale ? (
          <WorkStatusRow label={t('chat.workStatus.pty.refreshFailed')} value={<WorkStatusValue tone="warning">!</WorkStatusValue>} />
        ) : null}
      </>
    );
  }

  return (
    <>
      <WorkStatusCollapsibleSection
        id={SECTION_ID}
        title={t('chat.workStatus.section.ptys')}
        icon="terminal"
        summary={state.availability === 'available' ? state.sessions.length : undefined}
      >
        {body}
      </WorkStatusCollapsibleSection>
      <OpenCodePtyOutputDialog session={selected} onOpenChange={(open) => { if (!open) setSelectedId(null); }} />
    </>
  );
};
