import { resolveDefaultSshInstanceId } from './startup-ssh.mjs';

const isStartupFallbackFor = (outcome, hostId) => outcome?.target === 'local'
  && outcome.status === 'ok' && outcome.sshStartupFallbackHostId === hostId;

const retainDesktopBootFailure = ({ outcome, previousOutcome, sshInstanceId, sshForwarded, unreachableHosts, relayCapable }) => {
  if (outcome.target !== 'remote' || outcome.status !== 'ok') return outcome;
  if (isStartupFallbackFor(previousOutcome, outcome.hostId) && sshInstanceId === outcome.hostId && !sshForwarded) {
    return previousOutcome;
  }
  if (!relayCapable && unreachableHosts.has(outcome.url)) return { ...outcome, status: 'unreachable' };
  return outcome;
};

/** Recompute saved-host metadata without inventing a startup attempt or retrying a connection. */
export const recomputeDesktopBootOutcome = ({ config, state, envTargetUrl, sshManager, computeBootOutcome }) => {
  const outcome = computeBootOutcome({
    config, envTargetUrl: envTargetUrl || null, probe: null,
    localAvailable: Boolean(state.sidecarUrl || state.localOrigin),
  });
  if (envTargetUrl) return outcome;
  const host = config.hosts.find((entry) => entry.id === config.defaultHostId);
  const sshInstanceId = resolveDefaultSshInstanceId(config.defaultHostId, sshManager.readInstances().instances);
  return retainDesktopBootFailure({
    outcome, previousOutcome: state.bootOutcome, sshInstanceId,
    sshForwarded: Boolean(host && sshManager.isForwardedApiUrl(host.apiUrl || host.url, host.id)),
    unreachableHosts: state.unreachableHosts,
    relayCapable: Boolean(host?.relay),
  });
};

/** Select a default window's complete binding from the parsed native host configuration. */
export const resolveDefaultDesktopWindow = ({ config, state, localUiUrl, localClientToken, packaged }) => {
  const localApiBaseUrl = state.sidecarUrl || state.localOrigin || '';
  const local = {
    targetUrl: localUiUrl,
    runtimeConfig: { apiBaseUrl: localApiBaseUrl, clientToken: localApiBaseUrl ? localClientToken : '', requestHeaders: {} },
  };
  const host = config.hosts.find((entry) => entry.id === config.defaultHostId);
  const apiUrl = host?.apiUrl || host?.url;
  if (!host?.url || state.unreachableHosts.has(apiUrl)) return local;
  if (isStartupFallbackFor(state.bootOutcome, host.id)) return local;
  return {
    targetUrl: packaged ? localUiUrl : host.url,
    runtimeConfig: {
      apiBaseUrl: /^https?:\/\//.test(apiUrl) ? apiUrl : null,
      clientToken: host.clientToken || '',
      requestHeaders: host.requestHeaders || {},
    },
  };
};
