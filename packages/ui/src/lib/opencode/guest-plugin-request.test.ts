import { describe, expect, test } from 'bun:test';

import { GUEST_OPENCODE_RESPONSE_MAX, type OpenCodeRequest } from '@openchamber/sdk';

import { requestGuestPluginRoute } from './guest-plugin-request';

const request: OpenCodeRequest = {
  pluginId: 'example-plugin',
  method: 'POST',
  path: '/snapshot',
  query: { session: 'a/b', full: 'true' },
  body: '{"input":"x"}',
};

describe('requestGuestPluginRoute', () => {
  test('preserves the route, method, body, query, and directory scope', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await requestGuestPluginRoute(request, '/repo/app dir', async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response('{"snapshot":"ok"}', { status: 206 });
    });

    expect(result).toEqual({ status: 206, body: '{"snapshot":"ok"}' });
    expect(calls).toEqual([{
      url: '/api/plugins/example-plugin/snapshot?session=a%2Fb&full=true',
      init: {
        method: 'POST',
        headers: { 'x-opencode-directory': encodeURIComponent('/repo/app dir') },
        body: '{"input":"x"}',
      },
    }]);
  });

  test('rejects a path that normalizes outside the plugin route', async () => {
    let calls = 0;
    await expect(requestGuestPluginRoute({ ...request, path: '/../../config' }, '/repo', async () => {
      calls += 1;
      return new Response('unexpected');
    })).rejects.toThrow('escaped');
    expect(calls).toBe(0);
  });

  test('stops reading a plugin response at the public body limit', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(GUEST_OPENCODE_RESPONSE_MAX + 1)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const result = await requestGuestPluginRoute(request, '/repo', async () => new Response(stream));
    expect(result.body).toHaveLength(GUEST_OPENCODE_RESPONSE_MAX);
    expect(cancelled).toBe(true);
  });
});
