import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retainDesktopBootFailure } from './desktop-boot-fallback.mjs';

const remote = { target: 'remote', status: 'ok', hostId: 'b', url: 'http://127.0.0.1:43001', localAvailable: true };
const saved = (options = {}) => retainDesktopBootFailure({ outcome: remote, unreachableHosts: new Set(), relayCapable: false, ...options });

test('settings saves retain Local while the default SSH instance has no live forward', () => {
  const first = saved({ sshInstanceId: 'b', sshForwarded: false });
  assert.deepEqual(first, { target: 'local', status: 'ok', localAvailable: true, sshStartupFallbackHostId: 'b' });
  assert.deepEqual(saved({ sshInstanceId: 'b', sshForwarded: false }), first);
});

test('a live SSH forward clears the startup fallback', () => {
  assert.deepEqual(saved({ sshInstanceId: 'b', sshForwarded: true }), remote);
});

test('settings saves do not forget a direct endpoint rejected at startup', () => {
  assert.deepEqual(saved({ unreachableHosts: new Set([remote.url]) }), { ...remote, status: 'unreachable' });
});

test('a different default does not inherit another host failure', () => {
  assert.deepEqual(saved({ sshInstanceId: 'a', unreachableHosts: new Set(['https://unreachable.test']) }), remote);
});

test('a failed direct address does not suppress the relay strategy', () => {
  assert.deepEqual(saved({ unreachableHosts: new Set([remote.url]), relayCapable: true }), remote);
});

test('explicit environment, Local and recovery outcomes stay authoritative', () => {
  for (const outcome of [
    { ...remote, hostId: '__env' },
    { target: 'local', status: 'ok' },
    { ...remote, status: 'wrong-service' },
  ]) assert.deepEqual(saved({ outcome, sshInstanceId: 'b' }), outcome);
});
