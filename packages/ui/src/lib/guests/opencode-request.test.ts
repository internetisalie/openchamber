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
  test('calls only the declared plugin route and preserves status and body', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await proxyGuestOpenCodeRequest(guest(), request({
      method: 'POST',
      query: { session: 'a/b', full: 'true' },
      body: '{"input":"x"}',
    }), async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response('{"snapshot":"ok"}', { status: 206 });
    });

    expect(result).toEqual({ ok: true, result: { status: 206, body: '{"snapshot":"ok"}' } });
    expect(calls).toEqual([{
      url: '/api/plugins/example-plugin/snapshot?session=a%2Fb&full=true',
      init: { method: 'POST', body: '{"input":"x"}' },
    }]);
    expect(calls[0]?.init?.headers).toBeUndefined();
  });

  test('rejects disabled, unapproved, undeclared, and malformed requests before fetch', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return new Response('unexpected');
    };
    const attempts = [
      proxyGuestOpenCodeRequest(guest({ enabled: false }), request(), fetcher),
      proxyGuestOpenCodeRequest(guest({ capabilities: { requested: ['opencode'], granted: [] } }), request(), fetcher),
      proxyGuestOpenCodeRequest(guest(), request({ pluginId: 'other' }), fetcher),
      proxyGuestOpenCodeRequest(guest(), request({ method: 'DELETE' }), fetcher),
      proxyGuestOpenCodeRequest(guest(), request({ path: '/../config' }), fetcher),
      proxyGuestOpenCodeRequest(guest(), request({ path: '/%2e%2e/config' }), fetcher),
    ];
    const results = await Promise.all(attempts);
    expect(results.map((result) => result.ok ? 'ok' : result.code)).toEqual([
      'DISABLED', 'NOT_GRANTED', 'NOT_GRANTED', 'NOT_GRANTED', 'BAD_PATH', 'BAD_PATH',
    ]);
    expect(calls).toBe(0);
  });

  test('caps a large OpenCode wire response at 4 MiB', async () => {
    const result = await proxyGuestOpenCodeRequest(
      guest(),
      request(),
      async () => new Response('x'.repeat(GUEST_OPENCODE_RESPONSE_MAX + 1)),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.result.body).toHaveLength(GUEST_OPENCODE_RESPONSE_MAX);
  });
});
