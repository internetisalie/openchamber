import React from 'react';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useI18n } from '@/lib/i18n';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { readLocationManifest, type LocationManifestState } from './location-manifest';
import { WorkStatusNote, WorkStatusRow, WorkStatusSection } from './WorkStatusPrimitives';

function LocationManifestRows({ state }: { state: LocationManifestState }) {
  const { t } = useI18n();
  switch (state.status) {
    case 'missing': return null;
    case 'loading': return <WorkStatusNote>{t('common.loading')}</WorkStatusNote>;
    case 'unsupported': return <WorkStatusNote>{t('mobile.files.error.readUnavailable')}</WorkStatusNote>;
    case 'invalid': return <WorkStatusNote>{t('chat.workStatus.location.invalid')}</WorkStatusNote>;
    case 'failed': return <WorkStatusNote>{t('chat.workStatus.location.failed')}</WorkStatusNote>;
    case 'ready': return state.manifest.members.map((member) => (
      <React.Fragment key={member.dir}>
        <WorkStatusRow icon="folder" label={`${member.role} · ${member.repo}`} />
        <WorkStatusNote truncate>
          <span title={`${member.dir} · ${member.pin.sha} · ${member.pin.ref} · ${member.pin.branch}`}>
            {`${member.dir} · ${member.pin.sha.slice(0, 12)} · ${member.pin.ref} · ${member.pin.branch}`}
          </span>
        </WorkStatusNote>
      </React.Fragment>
    ));
  }
}

type LocationSectionProps = Omit<React.ComponentProps<typeof WorkStatusSection>, 'title'> & { directory: string | null };

export function LocationSectionContent({ directory, state, children, ...section }: LocationSectionProps & { state: LocationManifestState }) {
  const { t } = useI18n();
  return (
    <WorkStatusSection {...section} title={t('chat.workStatus.section.location')}>
      {directory ? <WorkStatusRow icon="folder" label={<span title={directory}>{directory}</span>} /> : null}
      <LocationManifestRows state={state} />
      {children}
    </WorkStatusSection>
  );
}

export function WorkStatusLocationSection({ directory, ...section }: LocationSectionProps) {
  const { files } = useRuntimeAPIs();
  const runtimeKey = React.useSyncExternalStore(subscribeRuntimeEndpointChanged, getRuntimeKey, getRuntimeKey);
  const [result, setResult] = React.useState<{
    directory: string; runtimeKey: string; state: LocationManifestState;
  } | null>(null);
  React.useEffect(() => {
    if (!directory) return;
    const controller = new AbortController();
    void readLocationManifest(files, directory, controller.signal).then((state) => {
      if (!controller.signal.aborted) setResult({ directory, runtimeKey, state });
    });
    return () => controller.abort();
  }, [files, directory, runtimeKey]);
  const state: LocationManifestState = !directory ? { status: 'missing' }
    : result?.directory === directory && result.runtimeKey === runtimeKey ? result.state : { status: 'loading' };
  return <LocationSectionContent {...section} directory={directory} state={state} />;
}
