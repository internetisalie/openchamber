import { describe, expect, test } from 'bun:test';

import { openCodeProxyPath } from './openCodeProxyPath';

describe('openCodeProxyPath', () => {
  test('preserves OpenCode plugin routes and their query', () => {
    const url = new URL('https://openchamber.invalid/api/plugins/opencode-pty-bridge/sessions/pty-1/output?after=12');
    expect(openCodeProxyPath(url)).toBe('/api/plugins/opencode-pty-bridge/sessions/pty-1/output?after=12');
  });

  test('keeps the existing API-prefix removal for ordinary OpenCode routes', () => {
    const url = new URL('https://openchamber.invalid/api/session?directory=%2Frepo');
    expect(openCodeProxyPath(url)).toBe('/session?directory=%2Frepo');
  });
});
