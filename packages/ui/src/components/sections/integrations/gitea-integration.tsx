import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Icon } from '@/components/icon/Icon';
import { SettingsCheckboxRow, SettingsStackedField } from '@/components/sections/shared/SettingsSection';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { GiteaConnection } from '@/lib/api/types';

export function GiteaIntegration() {
  const { t } = useI18n();
  const { gitea } = useRuntimeAPIs();
  const [open, setOpen] = React.useState(false);
  const [connections, setConnections] = React.useState<GiteaConnection[]>([]);
  const [instanceUrl, setInstanceUrl] = React.useState('');
  const [token, setToken] = React.useState('');
  const [allowHttp, setAllowHttp] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!gitea) return;
    let current = true;
    setLoading(true);
    void gitea.connections().then((next) => {
      if (current) { setConnections(next); setError(null); }
    }).catch(() => {
      if (current) setError(t('settings.integrations.gitea.loadFailed'));
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [gitea, t]);

  if (!gitea) return null;

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const connected = await gitea.connect(instanceUrl, token, allowHttp);
      setConnections((previous) => [...previous.filter((entry) => entry.instanceUrl !== connected.instanceUrl), connected]);
      setInstanceUrl('');
      setToken('');
      setAllowHttp(false);
    } catch (error) {
      setError(error instanceof Error && error.message
        ? error.message : t('settings.integrations.gitea.connectFailed'));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (url: string) => {
    setBusy(true);
    setError(null);
    try {
      const removed = await gitea.disconnect(url);
      if (!removed) throw new Error('Gitea connection was already removed');
      setConnections((previous) => previous.filter((entry) => entry.instanceUrl !== url));
    } catch {
      setError(t('settings.integrations.gitea.disconnectFailed'));
    } finally {
      setBusy(false);
    }
  };

  const status = loading ? t('common.loading')
    : error && connections.length === 0 ? error
    : connections[0]?.instanceUrl ?? t('settings.integrations.gitea.notConnected');

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div data-settings-item="integrations.gitea"
        className="overflow-hidden rounded-xl border border-[var(--interactive-border)] bg-[var(--surface-elevated)]">
        <CollapsibleTrigger className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left hover:bg-[var(--interactive-hover)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--interactive-focus-ring)]">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--surface-muted)]">
            <Icon name="server" className="size-5 text-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">{t('settings.integrations.gitea.title')}</div>
            <p className="mt-0.5 line-clamp-1 text-xs leading-snug text-muted-foreground">
              {t('settings.integrations.gitea.description')}
            </p>
          </div>
          <span aria-live="polite" className={cn('max-w-36 shrink-0 truncate rounded-full px-2 py-0.5 text-[10px] font-medium',
            connections.length ? 'bg-[var(--status-success)]/15 text-[var(--status-success)]' : 'bg-[var(--surface-muted)] text-muted-foreground')}>
            {status}
          </span>
          <Icon name="arrow-down-s" className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out motion-reduce:transition-none', open && 'rotate-180')} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-5 border-t border-[var(--interactive-border)] px-4 py-4">
          {connections.map((connection) => (
            <div key={connection.instanceUrl} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 text-sm">
                <div className="truncate font-medium">{connection.instanceUrl}</div>
                <div className="text-muted-foreground">{connection.user.login}</div>
              </div>
              <Button variant="destructive" size="sm" disabled={busy} onClick={() => void disconnect(connection.instanceUrl)}>
                {t('settings.integrations.gitea.disconnect')}
              </Button>
            </div>
          ))}
          <form onSubmit={(event) => void connect(event)} className="space-y-4">
            <SettingsStackedField label={t('settings.integrations.gitea.instanceUrl')}>
              <Input type="url" required value={instanceUrl} onChange={(event) => setInstanceUrl(event.target.value)}
                placeholder="https://gitea.example.com" autoComplete="url" className="h-8" />
            </SettingsStackedField>
            <SettingsStackedField label={t('settings.integrations.gitea.token')}>
              <Input type="password" required value={token} onChange={(event) => setToken(event.target.value)}
                autoComplete="off" className="h-8" />
            </SettingsStackedField>
            {instanceUrl.trim().toLowerCase().startsWith('http://') ? (
              <SettingsCheckboxRow checked={allowHttp} onChange={setAllowHttp}
                label={t('settings.integrations.gitea.allowHttp')}
                ariaLabel={t('settings.integrations.gitea.allowHttp')} />
            ) : null}
            {error ? <p role="alert" className="text-sm text-[var(--status-error-text)]">{error}</p> : null}
            <Button type="submit" size="sm" disabled={busy || !instanceUrl.trim() || !token.trim()
              || (instanceUrl.trim().toLowerCase().startsWith('http://') && !allowHttp)}>
              {t('settings.integrations.gitea.connect')}
            </Button>
          </form>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
