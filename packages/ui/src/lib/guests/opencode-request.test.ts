import { describe, expect, test } from 'bun:test';

import { GUEST_OPENCODE_RESPONSE_MAX, type OpenCodeRequest } from '@openchamber/sdk';

import { proxyGuestOpenCodeRequest } from './opencode-request';
import type { InstalledGuest } from './types';

const guest = (overrides: Partial<InstalledGuest> = {}): InstalledGuest => ({
  id: 'example-extension',
  name: 'Plugin Client',
  icon: 'apps',
  entry: 'panel/index.html',
  openCode: { plugins: [{ id: 'example-plugin', methods: ['GET', 'POST'] }] },
  capabilities: { requested: ['opencode'], granted: ['opencode'] },
  ...overrides,
});

const request = (overrides: Partial<OpenCodeRequest> = {}): OpenCodeRequest => ({
  pluginId: 'example-plugin',
  method: 'GET',
  path: '/snapshot',
  ...overrides,
});

describe('proxyGuestOpenCodeRequest', () => {
  test('passes an approved request and current directory to the OpenCode adapter', async () => {
    const calls: Array<{ request: OpenCodeRequest; directory: string }> = [];
    const result = await proxyGuestOpenCodeRequest(guest(), request({
      method: 'POST',
      query: { session: 'a/b', full: 'true' },
      body: '{"input":"x"}',
    }), '/repo/active', async (outgoing, directory) => {
      calls.push({ request: outgoing, directory });
      return { status: 206, body: '{"snapshot":"ok"}' };
    });

    expect(result).toEqual({ ok: true, result: { status: 206, body: '{"snapshot":"ok"}' } });
    expect(calls).toEqual([{
      request: { pluginId: 'example-plugin', method: 'POST', path: '/snapshot', query: { session: 'a/b', full: 'true' }, body: '{"input":"x"}' },
      directory: '/repo/active',
    }]);
  });

  test('rejects disabled, unapproved, undeclared, and malformed requests before fetch', async () => {
    let calls = 0;
    const requester = async () => {
      calls += 1;
      return { status: 200, body: 'unexpected' };
    };
    const attempts = [
      proxyGuestOpenCodeRequest(guest({ enabled: false }), request(), '/repo', requester),
      proxyGuestOpenCodeRequest(guest({ capabilities: { requested: ['opencode'], granted: [] } }), request(), '/repo', requester),
      proxyGuestOpenCodeRequest(guest(), request({ pluginId: 'other' }), '/repo', requester),
      proxyGuestOpenCodeRequest(guest(), request({ method: 'DELETE' }), '/repo', requester),
      proxyGuestOpenCodeRequest(guest(), request({ path: '/../config' }), '/repo', requester),
      proxyGuestOpenCodeRequest(guest(), request({ path: '/%2e%2e/config' }), '/repo', requester),
      proxyGuestOpenCodeRequest(guest(), request(), null, requester),
    ];
    const results = await Promise.all(attempts);
    expect(results.map((result) => result.ok ? 'ok' : result.code)).toEqual([
      'DISABLED', 'NOT_GRANTED', 'NOT_GRANTED', 'NOT_GRANTED', 'BAD_PATH', 'BAD_PATH', 'NO_DIRECTORY',
    ]);
    expect(calls).toBe(0);
  });

  test('caps a large OpenCode wire response at 4 MiB', async () => {
    const result = await proxyGuestOpenCodeRequest(
      guest(),
      request(),
      '/repo',
      async () => ({ status: 200, body: 'x'.repeat(GUEST_OPENCODE_RESPONSE_MAX + 1) }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result.body).toHaveLength(GUEST_OPENCODE_RESPONSE_MAX);
  });
});
