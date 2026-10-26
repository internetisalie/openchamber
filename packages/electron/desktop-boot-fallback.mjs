/** Retain native startup failures when saving settings without retrying a connection. */
export const retainDesktopBootFailure = ({ outcome, sshInstanceId, sshForwarded, unreachableHosts, relayCapable }) => {
  if (outcome.target !== 'remote' || outcome.status !== 'ok') return outcome;
  if (sshInstanceId === outcome.hostId && !sshForwarded) {
    return {
      target: 'local',
      status: 'ok',
      localAvailable: outcome.localAvailable,
      sshStartupFallbackHostId: sshInstanceId,
    };
  }
  if (!relayCapable && unreachableHosts.has(outcome.url)) return { ...outcome, status: 'unreachable' };
  return outcome;
};
