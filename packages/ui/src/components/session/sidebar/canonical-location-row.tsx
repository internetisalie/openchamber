import React from 'react';
import { useI18n, getCurrentIntlLocale } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { Icon } from '@/components/icon/Icon';
import type { Session } from '@/lib/opencode/model';
import type { CanonicalLocationGroup } from './canonical-location-model';
import { useCanonicalSidebarPreferences } from './canonical-sidebar-preferences';
import { WorkspaceComposition } from './workspace-composition';
import { DispatchProjectionFacts } from './dispatch-projection-facts';
import type { DispatchProjectionState } from './dispatch-projection';

export function LocationSessionFacts({ session, source, predecessor, dispatch, placementConflict }: {
  session: Session; source: string; predecessor: Session | null; dispatch?: DispatchProjectionState; placementConflict?: boolean;
}) {
  const updated = useGlobalSessionsStore((state) => state.entityById.get(session.id)?.time.updated ?? session.time.updated);
  return <div className="flex items-center gap-2 px-1 typography-micro text-muted-foreground">
    <time dateTime={new Date(updated).toISOString()}>{new Date(updated).toLocaleString(getCurrentIntlLocale())}</time>
    {dispatch ? <DispatchProjectionFacts state={dispatch} conflict={placementConflict} /> : null}
    {predecessor ? <button type="button" title={predecessor.title} aria-label={predecessor.title}
      onClick={() => { if (getRuntimeKey() === source) useSessionUIStore.getState().setCurrentSession(predecessor.id, predecessor.directory); }}>
      <Icon name="arrow-left" className="size-3" />
    </button> : null}
  </div>;
}

export function CanonicalLocationRow({ row, onToggle, children }: {
  row: CanonicalLocationGroup; onToggle: () => void; children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const moveWorkspace = useCanonicalSidebarPreferences((state) => state.moveWorkspace);
  return <div style={{ paddingInlineStart: 6 + row.depth * 12 }} data-location-kind={row.groupKind}>
    <div className="flex items-center gap-1 min-h-8">
      <button type="button" aria-expanded={row.expanded} onClick={onToggle}
        aria-label={row.groupKind === 'finished' ? t('sessions.sidebar.location.finished') : row.label}
        className="flex min-w-0 items-center gap-1 text-start text-muted-foreground hover:text-foreground">
        <Icon name={row.expanded ? 'arrow-down-s' : 'arrow-right-s'} className="size-3.5 shrink-0" />
        <span className="truncate" title={row.label}>{row.groupKind === 'finished' ? t('sessions.sidebar.location.finished') : row.label}</span>
      </button>
      {row.groupKind === 'workspace' ? <DispatchProjectionFacts state={row.dispatchAttribution} workspace conflict={row.placementConflict} /> : null}
      {row.previousWorkspaceKey ? <button type="button" aria-label={t('mobile.sessions.moveUpAria', { label: row.label })}
        onClick={() => { if (row.previousWorkspaceKey) moveWorkspace(row.key, row.previousWorkspaceKey, row.workspaceSiblingKeys ?? []); }}>
        <Icon name="arrow-up" className="size-3.5" />
      </button> : null}
    </div>
    {row.groupKind === 'workspace' && row.expanded && row.directory
      ? <WorkspaceComposition directory={row.directory} source={row.source} /> : null}
    {children}
  </div>;
}
