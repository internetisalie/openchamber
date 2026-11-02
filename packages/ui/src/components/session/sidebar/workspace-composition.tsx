import React from 'react';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useI18n } from '@/lib/i18n';
import { readLocationManifest, type LocationManifestState } from '@/components/chat/work-status/location-manifest';

export const canReadWorkspaceComposition = (source: string, activeSource: string, directory: string, sessionDirectory: string | undefined) =>
  source === activeSource && directory === sessionDirectory;

export function WorkspaceComposition({ directory, source }: { directory: string; source: string }) {
  const { files } = useRuntimeAPIs();
  const { t } = useI18n();
  const sessionId = useSessionUIStore((state) => state.currentSessionId);
  const sessionDirectory = useGlobalSessionsStore((state) => sessionId ? state.entityById.get(sessionId)?.directory : undefined);
  const readable = canReadWorkspaceComposition(source, getRuntimeKey(), directory, sessionDirectory);
  const [result, setResult] = React.useState<{ source: string; directory: string; state: LocationManifestState } | null>(null);
  React.useEffect(() => {
    if (!readable) return;
    const controller = new AbortController();
    void readLocationManifest(files, directory, controller.signal).then((state) => {
      if (!controller.signal.aborted) setResult({ source, directory, state });
    });
    return () => controller.abort();
  }, [files, directory, readable, source]);
  if (!readable) return null;
  const state = result?.directory === directory && result.source === source ? result.state : null;
  if (!state || state.status === 'loading') return <div className="typography-micro text-muted-foreground">{t('common.loading')}</div>;
  if (state.status === 'missing') return null;
  if (state.status !== 'ready') return <div className="typography-micro text-muted-foreground">
    {t(state.status === 'invalid' ? 'chat.workStatus.location.invalid'
      : state.status === 'failed' ? 'chat.workStatus.location.failed' : 'mobile.files.error.readUnavailable')}
  </div>;
  return <ul className="ps-4 typography-micro text-muted-foreground">
    {state.manifest.members.map((member) => <li key={member.dir} className="truncate"
      title={`${member.role} · ${member.repo} · ${member.dir} · ${member.pin.sha} · ${member.pin.ref} · ${member.pin.branch}`}>
      {`${member.role} · ${member.repo} · ${member.dir} · ${member.pin.sha.slice(0, 12)}`}
    </li>)}
  </ul>;
}
