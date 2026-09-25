import { beforeEach, describe, expect, mock, test } from 'bun:test';

let response = new Response(null, { status: 500 });
const calls: Array<{ path: string; init: RequestInit & { query?: Record<string, string | number> } }> = [];
const runtimeFetch = mock(async (path: string, init: RequestInit & { query?: Record<string, string | number> }) => {
  calls.push({ path, init });
  return response;
});

mock.module('../runtime-fetch', () => ({ runtimeFetch }));

const {
  OpenCodePtyApiError,
  listOpenCodePtySessions,
  probeOpenCodePtyBridge,
  readOpenCodePtyOutput,
} = await import('./pty-bridge');

const session = {
  id: 'pty-1',
  parentSessionId: 'ses-1',
  title: 'Dev server',
  command: 'bun',
  args: ['run', 'dev'],
  workdir: '/workspace',
  status: 'running',
  createdAt: '2026-09-18T12:00:00.000Z',
};

beforeEach(() => {
  calls.length = 0;
});

const captureError = async (operation: Promise<unknown>): Promise<InstanceType<typeof OpenCodePtyApiError>> => {
  try {
    await operation;
  } catch (error) {
    if (error instanceof OpenCodePtyApiError) return error;
    throw error;
  }
  throw new Error('Expected OpenCode PTY API request to fail');
};

describe('OpenCode PTY API', () => {
  test('distinguishes available, absent, and authentication capability results', async () => {
    response = Response.json({ id: 'opencode-pty-bridge', schemaVersion: 1, opencodePtyVersion: '0.4.1' });
    expect(await probeOpenCodePtyBridge()).toEqual({
      status: 'available',
      capability: { id: 'opencode-pty-bridge', schemaVersion: 1, opencodePtyVersion: '0.4.1' },
    });

    response = Response.json({ error: 'Not found' }, { status: 404 });
    expect(await probeOpenCodePtyBridge()).toEqual({ status: 'absent' });

    response = Response.json({ error: 'Unauthorized' }, { status: 401 });
    expect(await probeOpenCodePtyBridge()).toEqual({ status: 'authentication-error' });
  });

  test('does not treat server failures or malformed schemas as absence', async () => {
    response = Response.json({ error: 'Unavailable' }, { status: 503 });
    const serverError = await captureError(probeOpenCodePtyBridge());
    expect({ kind: serverError.kind, status: serverError.status }).toEqual({ kind: 'http', status: 503 });

    response = Response.json({ id: 'opencode-pty-bridge', schemaVersion: 2, opencodePtyVersion: '0.4.1' });
    expect((await captureError(probeOpenCodePtyBridge())).kind).toBe('invalid-response');
  });

  test('validates parent session ownership and requests incremental output', async () => {
    response = Response.json({ schemaVersion: 1, revision: 4, sessions: [session] });
    expect((await listOpenCodePtySessions()).sessions).toEqual([session]);
    expect(calls.at(-1)?.path).toBe('/api/plugins/opencode-pty-bridge/sessions');

    response = Response.json({ schemaVersion: 1, revision: 5, reset: false, data: 'ready\n' });
    expect((await readOpenCodePtyOutput('pty/1', 4)).data).toBe('ready\n');
    expect(calls.at(-1)).toEqual({
      path: '/api/plugins/opencode-pty-bridge/sessions/pty%2F1/output',
      init: {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: undefined,
        query: { after: 4 },
      },
    });
  });

  test('rejects a session list without authoritative parent IDs', async () => {
    const withoutParent: Partial<typeof session> = { ...session };
    delete withoutParent.parentSessionId;
    response = Response.json({ schemaVersion: 1, revision: 4, sessions: [withoutParent] });

    expect((await captureError(listOpenCodePtySessions())).kind).toBe('invalid-response');
  });
});
