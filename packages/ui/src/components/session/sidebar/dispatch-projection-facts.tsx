import React from 'react';
import { useI18n } from '@/lib/i18n';
import type { DispatchProjectionState } from './dispatch-projection';

export function DispatchProjectionFacts({ state, workspace = false, conflict = false }: {
  state: DispatchProjectionState; workspace?: boolean; conflict?: boolean;
}) {
  const { t } = useI18n();
  let details: string;
  switch (state.status) {
    case 'known': {
      const item = state.context.item;
      details = [state.context.lane, item ? `${item.repository}/${item.subPath}#${item.id}` : t('sessions.sidebar.location.dispatchChore'),
        state.context.phase?.selector, state.agent ? t('sessions.sidebar.location.capturedAgent', { agent: state.agent }) : null]
        .filter(Boolean).join(' · ');
      break;
    }
    case 'legacy-unknown':
      details = [t('sessions.sidebar.location.dispatchUnknown'),
        state.agent ? t('sessions.sidebar.location.capturedAgent', { agent: state.agent }) : null].filter(Boolean).join(' · ');
      break;
    case 'unrequested': details = t('sessions.sidebar.location.dispatchUnknown'); break;
    case 'loading': details = t('common.loading'); break;
    case 'unsupported': details = t('common.unavailable'); break;
    case 'missing': details = t('sessions.sidebar.location.dispatchMissing'); break;
    case 'refused': details = t('sessions.sidebar.location.dispatchRefused'); break;
    case 'invalid': details = t('sessions.sidebar.location.dispatchInvalid'); break;
    case 'failed': details = t('sessions.sidebar.location.dispatchFailed'); break;
    case 'stale': details = t('sessions.sidebar.location.dispatchStale'); break;
    case 'cancelled': details = t('sessions.sidebar.location.dispatchCancelled'); break;
  }
  const text = t(workspace ? 'sessions.sidebar.location.workspaceDispatch' : 'sessions.sidebar.location.capturedDispatch', { details });
  return <span data-dispatch-status={state.status} data-dispatch-conflict={conflict || undefined}
    className="min-w-0 truncate typography-micro text-muted-foreground"
    title={conflict ? `${text} · ${t('sessions.sidebar.location.dispatchConflict')}` : text}>
    {conflict ? `${t('sessions.sidebar.location.dispatchConflict')} · ` : null}{text}
  </span>;
}
