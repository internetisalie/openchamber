import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recomputeDesktopBootOutcome, resolveDefaultDesktopWindow } from './desktop-boot-fallback.mjs';

const apiUrl = 'http://127.0.0.1:43001';
const remote = { target: 'remote', status: 'ok', hostId: 'b', url: apiUrl, localAvailable: true };
const fallback = { target: 'local', status: 'ok', localAvailable: true, sshStartupFallbackHostId: 'b' };
const localUiUrl = 'openchamber-ui://app/index.html';
const fixture = () => {
  const calls = { readInstances: 0, forwarded: [], compute: [] };
  const config = { defaultHostId: 'b', hosts: [{ id: 'b', url: 'https://ui-b.test', apiUrl, clientToken: 'fixture-token-b', requestHeaders: { 'X-Fixture': 'b' } }] };
  const state = { bootOutcome: fallback, sidecarUrl: 'http://127.0.0.1:3000', localOrigin: 'http://127.0.0.1:3000', unreachableHosts: new Set() };
  const params = {
    config, state, envTargetUrl: '',
    sshManager: {
      readInstances: () => { calls.readInstances += 1; return { instances: [{ id: 'b' }] }; },
      isForwardedApiUrl: (url, hostId) => { calls.forwarded.push({ url, hostId }); return false; },
    },
    computeBootOutcome: (input) => {
      calls.compute.push(input);
      const outcome = { ...remote, localAvailable: input.localAvailable };
      if (input.envTargetUrl) {
        outcome.hostId = '__env';
        outcome.url = input.envTargetUrl;
      }
      return outcome;
    },
  };
  return { params, calls };
};

test('settings-save derivation retains an actual startup fallback through the SSH manager', () => {
  const { params, calls } = fixture();
  assert.deepEqual(recomputeDesktopBootOutcome(params), fallback);
  assert.equal(calls.readInstances, 1);
  assert.deepEqual(calls.forwarded, [{ url: apiUrl, hostId: 'b' }]);
  assert.deepEqual(calls.compute, [{ config: params.config, envTargetUrl: null, probe: null, localAvailable: true }]);
});

test('only a real SSH instance can retain an SSH fallback', () => {
  const { params } = fixture();
  params.sshManager.readInstances = () => ({ instances: [{ id: 'other' }] });
  assert.deepEqual(recomputeDesktopBootOutcome(params), remote);
});

test('the saved apiUrl and instance id establish a recovered live forward', () => {
  const { params, calls } = fixture();
  params.sshManager.isForwardedApiUrl = (url, id) => { calls.forwarded.push({ url, hostId: id }); return url === apiUrl && id === 'b'; };
  assert.deepEqual(recomputeDesktopBootOutcome(params), remote);
  assert.deepEqual(calls.forwarded, [{ url: apiUrl, hostId: 'b' }]);
});

test('settings-save derivation reads the actual unreachable-host set', () => {
  const { params } = fixture();
  params.state.bootOutcome = remote;
  params.state.unreachableHosts.add(apiUrl);
  assert.deepEqual(recomputeDesktopBootOutcome(params), { ...remote, status: 'unreachable' });
});

test('a failed direct address does not suppress the parsed relay descriptor', () => {
  const { params } = fixture();
  params.state.bootOutcome = remote;
  params.state.unreachableHosts.add(apiUrl);
  params.config.hosts[0].relay = { relayUrl: 'wss://relay.test', serverId: 'b', hostEncPubJwk: { kty: 'EC', crv: 'P-256', x: 'fixture' } };
  assert.deepEqual(recomputeDesktopBootOutcome(params), remote);
});

test('environment override bypasses saved-host failure derivation', () => {
  const { params, calls } = fixture();
  params.envTargetUrl = 'https://env.test';
  params.state.unreachableHosts.add(params.envTargetUrl);
  assert.deepEqual(recomputeDesktopBootOutcome(params), { ...remote, hostId: '__env', url: params.envTargetUrl });
  assert.equal(calls.readInstances, 0);
  assert.deepEqual(calls.forwarded, []);
  assert.equal(calls.compute[0].envTargetUrl, params.envTargetUrl);
});

test('local availability comes from actual native roots, not the selected remote', () => {
  const { params } = fixture();
  params.state.bootOutcome = remote;
  params.state.sidecarUrl = '';
  assert.equal(recomputeDesktopBootOutcome(params).localAvailable, true);
  params.state.localOrigin = '';
  assert.equal(recomputeDesktopBootOutcome(params).localAvailable, false);
});

test('computed Local, chooser and recovery outcomes remain authoritative', () => {
  const { params } = fixture();
  params.state.unreachableHosts.add(apiUrl);
  for (const outcome of [
    { target: 'local', status: 'ok', localAvailable: true },
    { target: null, status: 'not-configured' },
    { ...remote, status: 'wrong-service' },
    { ...remote, status: 'unreachable' },
  ]) {
    params.computeBootOutcome = () => outcome;
    assert.deepEqual(recomputeDesktopBootOutcome(params), outcome);
  }
});

test('saving an unconnected SSH default does not invent a failed startup attempt', () => {
  const { params } = fixture();
  params.state.bootOutcome = { target: 'local', status: 'ok' };
  assert.deepEqual(recomputeDesktopBootOutcome(params), remote);
});

test('a temporarily reconnecting successful SSH boot keeps its remote identity', () => {
  const { params } = fixture();
  params.state.bootOutcome = remote;
  assert.deepEqual(recomputeDesktopBootOutcome(params), remote);
});

test('another host or a recovery outcome does not become a fresh SSH-startup toast', () => {
  const { params } = fixture();
  for (const previousOutcome of [
    { ...fallback, sshStartupFallbackHostId: 'other' },
    { ...fallback, status: 'unreachable' },
    { ...remote, sshStartupFallbackHostId: 'b' },
  ]) {
    params.state.bootOutcome = previousOutcome;
    assert.deepEqual(recomputeDesktopBootOutcome(params), remote);
  }
});

const windowFixture = () => {
  const { params } = fixture();
  return { config: params.config, state: params.state, localUiUrl, localClientToken: 'fixture-local-token', packaged: true };
};
const expectedLocal = {
  targetUrl: localUiUrl,
  runtimeConfig: { apiBaseUrl: 'http://127.0.0.1:3000', clientToken: 'fixture-local-token', requestHeaders: {} },
};

test('reopen and menu-window selection bind Local without any failed-SSH credential', () => {
  assert.deepEqual(resolveDefaultDesktopWindow(windowFixture()), expectedLocal);
});

test('a known unreachable direct default binds the entire window runtime to Local', () => {
  const input = windowFixture();
  input.state.bootOutcome = remote;
  input.state.unreachableHosts.add(apiUrl);
  assert.deepEqual(resolveDefaultDesktopWindow(input), expectedLocal);
});

test('an available default keeps its own complete binding, not another host token', () => {
  const input = windowFixture();
  input.state.bootOutcome = remote;
  assert.deepEqual(resolveDefaultDesktopWindow(input), { targetUrl: localUiUrl, runtimeConfig: { apiBaseUrl: apiUrl, clientToken: 'fixture-token-b', requestHeaders: { 'X-Fixture': 'b' } } });
  input.packaged = false;
  assert.equal(resolveDefaultDesktopWindow(input).targetUrl, 'https://ui-b.test');
});

test('a native window does not interpret a remote or unsuccessful outcome as a startup fallback', () => {
  const input = windowFixture();
  for (const outcome of [{ ...remote, sshStartupFallbackHostId: 'b' }, { ...fallback, status: 'unreachable' }]) {
    input.state.bootOutcome = outcome;
    assert.equal(resolveDefaultDesktopWindow(input).runtimeConfig.apiBaseUrl, apiUrl);
  }
});

test('Local, missing defaults and failures without a local backend never borrow stale remote auth', () => {
  const input = windowFixture();
  input.state.bootOutcome = remote;
  for (const id of ['local', 'removed', null]) {
    input.config.defaultHostId = id;
    assert.deepEqual(resolveDefaultDesktopWindow(input), expectedLocal);
  }
  input.config.defaultHostId = 'b';
  input.state.bootOutcome = fallback;
  input.state.sidecarUrl = '';
  input.state.localOrigin = '';
  input.state.apiBaseUrl = 'https://stale-remote.test';
  input.state.clientToken = 'fixture-stale-remote-token';
  assert.deepEqual(resolveDefaultDesktopWindow(input), { targetUrl: localUiUrl, runtimeConfig: { apiBaseUrl: '', clientToken: '', requestHeaders: {} } });
});

test('a credential-free default stays credential-free in a native new window', () => {
  const input = windowFixture();
  input.state.bootOutcome = remote;
  delete input.config.hosts[0].clientToken;
  delete input.config.hosts[0].requestHeaders;
  assert.deepEqual(resolveDefaultDesktopWindow(input).runtimeConfig, { apiBaseUrl: apiUrl, clientToken: '', requestHeaders: {} });
});
