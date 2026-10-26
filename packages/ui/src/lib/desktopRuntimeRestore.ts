import { isElectronShell } from '@/lib/desktop';
import { getInjectedBootOutcome } from '@/lib/desktopBoot';
import { desktopHostProbe, desktopHostsGet, desktopLocalClientTokenGet, getDesktopHostApiUrl, normalizeHostUrl, type DesktopHost, type HostProbeResult } from '@/lib/desktopHosts';
import { scheduleDesktopHostCandidateRefresh } from '@/lib/desktopRelayRestore';
import { getRuntimeBearerTokenSync, getRuntimeExtraHeadersSync } from '@/lib/runtime-auth';
import { getActiveRelayTunnel } from '@/lib/relay/runtime-tunnel';
import { getRuntimeApiBaseUrl, getRuntimeKey, isSshForwardedRuntime, switchRuntimeEndpoint } from '@/lib/runtime-switch';

// Give a stored direct address a headstart before selecting the relay transport.
const DIRECT_PROBE_HEADSTART_MS = 1_500;

const probeAcceptsRuntime = (probe: HostProbeResult): boolean =>
  probe.status === 'ok' || probe.status === 'auth' || probe.status === 'update-recommended';

const probeDirectHost = (host: DesktopHost, url: string): Promise<HostProbeResult> =>
  desktopHostProbe(url, {
    clientToken: host.clientToken || null,
    requestHeaders: host.requestHeaders || null,
    expectedServerId: host.relay?.serverId,
  }).catch(() => ({ status: 'unreachable', latencyMs: 0 }));

const matchesActiveDirectRuntime = (host: DesktopHost, url: string): boolean => {
  const headers = host.requestHeaders ?? {};
  const activeHeaders = getRuntimeExtraHeadersSync();
  return !getActiveRelayTunnel()
    && getRuntimeKey() === `host:${host.id}`
    && getRuntimeApiBaseUrl() === url
    && getRuntimeBearerTokenSync() === (host.clientToken || '')
    && isSshForwardedRuntime() === (host.sshForwarded === true)
    && Object.keys(headers).length === Object.keys(activeHeaders).length
    && Object.entries(headers).every(([key, value]) => activeHeaders[key] === value);
};

const shellRejectedHost = (hostId: string): boolean => {
  const outcome = getInjectedBootOutcome();
  if (!outcome) return false;
  if (outcome.target === 'local' && outcome.status === 'ok') {
    return outcome.sshStartupFallbackHostId === hostId;
  }
  return outcome.target === 'remote' && outcome.hostId === hostId && outcome.status !== 'ok';
};

const switchToDirectHost = (host: DesktopHost, url: string): void => {
  switchRuntimeEndpoint({
    apiBaseUrl: url,
    clientToken: host.clientToken || null,
    requestHeaders: host.requestHeaders || null,
    runtimeKey: `host:${host.id}`,
    sshForwarded: host.sshForwarded === true,
  });
};

const restoreDirectHost = async (host: DesktopHost): Promise<void> => {
  const url = normalizeHostUrl(getDesktopHostApiUrl(host));
  if (!url || matchesActiveDirectRuntime(host, url)) return;
  const previousKey = getRuntimeKey();
  const previousUrl = getRuntimeApiBaseUrl();
  const probe = await probeDirectHost(host, url);
  if (getRuntimeKey() !== previousKey || getRuntimeApiBaseUrl() !== previousUrl) return;
  if (probeAcceptsRuntime(probe)) switchToDirectHost(host, url);
};

const restoreLocalRuntime = async (localOrigin: string | null | undefined): Promise<void> => {
  const url = normalizeHostUrl(localOrigin || '');
  if (!url) return;
  const clientToken = await desktopLocalClientTokenGet();
  switchRuntimeEndpoint({ apiBaseUrl: url, clientToken, runtimeKey: 'local' });
};

const switchToRelayHost = (host: DesktopHost): void => {
  switchRuntimeEndpoint({
    apiBaseUrl: typeof window !== 'undefined' ? window.location.origin : '',
    clientToken: host.clientToken || null,
    runtimeKey: `host:${host.id}`,
    relay: host.relay,
  });
  scheduleDesktopHostCandidateRefresh(host.id);
};

const restoreRelayHost = async (host: DesktopHost, reconnectActive?: boolean): Promise<void> => {
  const runtimeKey = `host:${host.id}`;
  if (getRuntimeKey() === runtimeKey && !reconnectActive) return;
  const directUrl = host.apiUrl ? normalizeHostUrl(getDesktopHostApiUrl(host)) : null;
  if (!directUrl) return switchToRelayHost(host);
  const probePromise = probeDirectHost(host, directUrl);
  const winner = await Promise.race([
    probePromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), DIRECT_PROBE_HEADSTART_MS)),
  ]);
  if (winner && probeAcceptsRuntime(winner)) return switchToDirectHost(host, directUrl);
  switchToRelayHost(host);
  if (winner) return;
  void probePromise.then((probe) => {
    if (probeAcceptsRuntime(probe) && getRuntimeKey() === runtimeKey) switchToDirectHost(host, directUrl);
  });
};

/** Restore a saved desktop target before mount; preserve native fallback/recovery decisions. */
export const restoreDesktopRuntime = async (
  targetHostId?: string,
  options?: { reconnectActive?: boolean },
): Promise<void> => {
  if (!isElectronShell()) return;
  const config = await desktopHostsGet().catch(() => null);
  const hostId = targetHostId || config?.defaultHostId;
  if (!config || !hostId) return;
  if (hostId === 'local') return restoreLocalRuntime(config.localOrigin);
  const host = config.hosts.find((entry) => entry.id === hostId);
  if (!host) return;
  if (host.relay) return restoreRelayHost(host, options?.reconnectActive);
  if (shellRejectedHost(hostId)) return;
  await restoreDirectHost(host);
};
