import React from 'react';

import { useI18n } from '@/lib/i18n';
import { useOpenCodePtySessions } from '@/hooks/useOpenCodePtySessions';
import { useUIStore } from '@/stores/useUIStore';
import type { OpenCodePtySession } from '@/lib/opencode/pty-bridge';
import { WorkStatusCollapsibleSection, WorkStatusRow, WorkStatusValue } from './WorkStatusPrimitives';
import { useReportWorkStatusPresence } from './presenceContext';
import { OpenCodePtyOutputDialog } from './OpenCodePtyOutputDialog';
import { AgentPtyExitedToggle } from './AgentPtyExitedToggle';

const SECTION_ID = 'ptys';

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
  const { state, sessions } = useOpenCodePtySessions(sessionId, active);
  const expanded = useUIStore((state) => state.workStatusExpandedSections[SECTION_ID] ?? false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSelectedId(null);
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
  } else if (sessions.length === 0) {
    body = <WorkStatusRow label={t(state.sessions.length > 0 ? 'chat.workStatus.pty.noneActive' : 'chat.workStatus.pty.none')} muted />;
  } else {
    body = (
      <>
        {sessions.map((session) => (
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
      </>
    );
  }

  return (
    <>
      <WorkStatusCollapsibleSection
        id={SECTION_ID}
        title={t('chat.workStatus.section.ptys')}
        icon="terminal"
        summary={!expanded && state.availability === 'available' ? sessions.length : undefined}
        action={expanded && state.availability === 'available' ? <AgentPtyExitedToggle /> : undefined}
      >
        {body}
        {state.stale ? (
          <WorkStatusRow label={t('chat.workStatus.pty.refreshFailed')} value={<WorkStatusValue tone="warning">!</WorkStatusValue>} />
        ) : null}
      </WorkStatusCollapsibleSection>
      <OpenCodePtyOutputDialog session={selected} onOpenChange={(open) => { if (!open) setSelectedId(null); }} />
    </>
  );
};
