import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { AgentPtyExitedToggle } from '@/components/chat/work-status/AgentPtyExitedToggle';
import { OpenCodePtyOutput } from '@/components/chat/work-status/OpenCodePtyOutput';
import { useOpenCodePtySessions } from '@/hooks/useOpenCodePtySessions';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useSessionUIStore } from '@/sync/session-ui-store';

const SessionPtyView: React.FC<{ sessionId: string | null; visible: boolean }> = ({ sessionId, visible }) => {
  const { t } = useI18n();
  const { state, sessions } = useOpenCodePtySessions(sessionId, visible);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = sessions.find((session) => session.id === selectedId) ?? sessions[0] ?? null;

  let message: string | null = null;
  if (!sessionId) message = t('agentPtyView.selectSession');
  else if (state.availability === 'pending') message = t('common.loading');
  else if (state.availability === 'absent') message = t('agentPtyView.bridgeUnavailable');
  else if (state.availability === 'authentication-error') message = t('chat.workStatus.pty.authenticationError');
  else if (state.availability === 'unknown') message = t('chat.workStatus.pty.availabilityUnknown');
  else if (sessions.length === 0) message = t(state.sessions.length > 0 ? 'chat.workStatus.pty.noneActive' : 'chat.workStatus.pty.none');

  return (
    <div className="flex h-full min-h-0 flex-col">
      {state.availability === 'available' ? (
        <div className="flex shrink-0 items-center justify-end border-b border-border px-2 py-1">
          <AgentPtyExitedToggle />
        </div>
      ) : null}
      {state.stale ? (
        <div role="status" className="shrink-0 bg-[var(--status-warning-background)] px-3 py-2 text-xs text-[var(--status-warning)]">
          {t('chat.workStatus.pty.refreshFailed')}
        </div>
      ) : null}
      {message ? (
        <div role="status" className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">{message}</div>
      ) : selected ? (
        <>
          <div role="group" aria-label={t('chat.workStatus.section.ptys')} className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-1">
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                aria-pressed={session.id === selected.id}
                onClick={() => setSelectedId(session.id)}
                className={cn('flex max-w-64 shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-interactive-hover', session.id === selected.id ? 'bg-interactive-selection text-foreground' : 'text-muted-foreground')}
              >
                <Icon name="terminal" className="size-3.5 shrink-0" />
                <span className="truncate">{session.title}</span>
                <span className={cn('shrink-0', session.status === 'running' ? 'text-status-success' : session.status === 'killing' ? 'text-status-warning' : 'text-muted-foreground')}>
                  {t(session.status === 'running' ? 'chat.workStatus.pty.running' : session.status === 'killing' ? 'chat.workStatus.pty.stopping' : 'chat.workStatus.pty.exited')}
                </span>
              </button>
            ))}
          </div>
          <div className="shrink-0 border-b border-border px-3 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono" title={[selected.command, ...selected.args].join(' ')}>{[selected.command, ...selected.args].join(' ')}</span>
              <span className="shrink-0">{t('chat.workStatus.pty.readOnly')}</span>
            </div>
            <div className="truncate" title={selected.workdir}>{selected.workdir}</div>
          </div>
          <OpenCodePtyOutput key={selected.id} session={selected} visible={visible} />
        </>
      ) : null}
    </div>
  );
};

export const AgentPtyView: React.FC<{ visible: boolean }> = ({ visible }) => {
  const sessionId = useSessionUIStore((state) => state.currentSessionId);
  return <SessionPtyView key={sessionId ?? 'draft'} sessionId={sessionId} visible={visible} />;
};
