import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';

type CapabilityResult =
  | { status: 'available'; capability: { id: 'opencode-pty-bridge'; schemaVersion: 1; opencodePtyVersion: string } }
  | { status: 'absent' }
  | { status: 'authentication-error' };

class OpenCodePtyApiError extends Error {
  constructor(
    readonly kind: 'authentication' | 'not-found' | 'http' | 'invalid-response',
    readonly status: number | null = null,
  ) {
    super(kind);
  }
}

const session = (id: string, parentSessionId: string, status: 'running' | 'exited', createdAt: string) => ({
  id,
  parentSessionId,
  title: id,
  command: 'sh',
  args: [],
  workdir: '/repo',
  status,
  createdAt,
});

let probeImpl: () => Promise<CapabilityResult>;
let listImpl: () => Promise<{ schemaVersion: 1; revision: number; sessions: ReturnType<typeof session>[] }>;
let outputImpl: (after?: number) => Promise<{ schemaVersion: 1; revision: number; reset: boolean; data: string }>;
let probeCalls = 0;
let listCalls = 0;
let outputCalls: Array<number | undefined> = [];
const runtimeListeners = new Set<() => void>();

mock.module('./pty-bridge', () => ({
  OpenCodePtyApiError,
  probeOpenCodePtyBridge: async () => {
    probeCalls += 1;
    return probeImpl();
  },
  listOpenCodePtySessions: async () => {
    listCalls += 1;
    return listImpl();
  },
  readOpenCodePtyOutput: async (_id: string, after?: number) => {
    outputCalls.push(after);
    return outputImpl(after);
  },
}));

mock.module('../runtime-switch', () => ({
  subscribeRuntimeEndpointChanged: (listener: () => void) => {
    runtimeListeners.add(listener);
    return () => runtimeListeners.delete(listener);
  },
}));

const { observeOpenCodePtyOutput, observeOpenCodePtySessions } = await import('./pty-observer');

let browser: Window;
const descriptors = new Map<string, PropertyDescriptor | undefined>();
const cleanups: Array<() => void> = [];
const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  browser = new Window({ url: 'http://localhost' });
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator })) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  Object.defineProperty(browser.document, 'visibilityState', { value: 'visible', configurable: true });
  Object.defineProperty(browser.navigator, 'onLine', { value: true, configurable: true });
  probeCalls = 0;
  listCalls = 0;
  outputCalls = [];
  runtimeListeners.clear();
  probeImpl = async () => ({
    status: 'available',
    capability: { id: 'opencode-pty-bridge', schemaVersion: 1, opencodePtyVersion: '0.4.1' },
  });
  listImpl = async () => ({ schemaVersion: 1, revision: 1, sessions: [] });
  outputImpl = async () => ({ schemaVersion: 1, revision: 0, reset: true, data: '' });
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  runtimeListeners.clear();
  await browser.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  descriptors.clear();
});

test('filters by parent session, orders running first, and retains successful state on failure', async () => {
  let invocation = 0;
  listImpl = async () => {
    invocation += 1;
    if (invocation > 1) throw new Error('offline');
    return {
      schemaVersion: 1,
      revision: 1,
      sessions: [
        session('exited', 'parent', 'exited', '2026-09-18T10:00:00.000Z'),
        session('other', 'another-parent', 'running', '2026-09-18T09:00:00.000Z'),
        session('running-new', 'parent', 'running', '2026-09-18T12:00:00.000Z'),
        session('running-old', 'parent', 'running', '2026-09-18T11:00:00.000Z'),
      ],
    };
  };
  const states: Array<{ availability: string; ids: string[]; stale: boolean }> = [];
  cleanups.push(observeOpenCodePtySessions('parent', (state) => {
    states.push({ availability: state.availability, ids: state.sessions.map(({ id }) => id), stale: state.stale });
  }, 5));

  await wait(20);

  expect(states.some((state) => JSON.stringify(state) === JSON.stringify({ availability: 'available', ids: ['running-old', 'running-new', 'exited'], stale: false }))).toBe(true);
  expect(states.at(-1)).toEqual({ availability: 'available', ids: ['running-old', 'running-new', 'exited'], stale: true });
});

test('does not request while hidden and stops after disposal', async () => {
  Object.defineProperty(browser.document, 'visibilityState', { value: 'hidden', configurable: true });
  const close = observeOpenCodePtySessions('parent', () => undefined, 5);
  cleanups.push(close);
  await wait();
  expect(probeCalls).toBe(0);

  Object.defineProperty(browser.document, 'visibilityState', { value: 'visible', configurable: true });
  browser.document.dispatchEvent(new browser.Event('visibilitychange'));
  await wait();
  expect(probeCalls).toBe(1);
  expect(listCalls).toBe(1);

  close();
  cleanups.pop();
  browser.dispatchEvent(new browser.Event('focus'));
  await wait(10);
  expect(listCalls).toBe(1);
});

test('clears state on runtime switch and rejects the previous runtime response', async () => {
  let resolveFirst: (value: { schemaVersion: 1; revision: number; sessions: ReturnType<typeof session>[] }) => void = () => undefined;
  const first = new Promise<{ schemaVersion: 1; revision: number; sessions: ReturnType<typeof session>[] }>((resolve) => {
    resolveFirst = resolve;
  });
  let invocation = 0;
  listImpl = () => {
    invocation += 1;
    if (invocation === 1) return first;
    return Promise.resolve({
      schemaVersion: 1,
      revision: 2,
      sessions: [session('new-runtime', 'parent', 'running', '2026-09-18T12:00:00.000Z')],
    });
  };
  const seen: string[][] = [];
  cleanups.push(observeOpenCodePtySessions('parent', (state) => seen.push(state.sessions.map(({ id }) => id)), 1000));
  await wait();

  for (const listener of runtimeListeners) listener();
  await wait();
  resolveFirst({
    schemaVersion: 1,
    revision: 1,
    sessions: [session('old-runtime', 'parent', 'running', '2026-09-18T11:00:00.000Z')],
  });
  await wait();

  expect(seen.some((ids) => ids.length === 1 && ids[0] === 'new-runtime')).toBe(true);
  expect(seen.some((ids) => ids.length === 1 && ids[0] === 'old-runtime')).toBe(false);
});

test('rejects a capability result from the previous runtime', async () => {
  let resolveFirst: (value: CapabilityResult) => void = () => undefined;
  const first = new Promise<CapabilityResult>((resolve) => {
    resolveFirst = resolve;
  });
  let invocation = 0;
  probeImpl = () => {
    invocation += 1;
    if (invocation === 1) return first;
    return Promise.resolve({
      status: 'available',
      capability: { id: 'opencode-pty-bridge', schemaVersion: 1, opencodePtyVersion: '0.4.1' },
    });
  };
  listImpl = async () => ({
    schemaVersion: 1,
    revision: 2,
    sessions: [session('new-runtime', 'parent', 'running', '2026-09-18T12:00:00.000Z')],
  });
  const seen: Array<{ availability: string; ids: string[] }> = [];
  cleanups.push(observeOpenCodePtySessions('parent', (state) => {
    seen.push({ availability: state.availability, ids: state.sessions.map(({ id }) => id) });
  }, 1000));
  await wait();

  for (const listener of runtimeListeners) listener();
  await wait();
  resolveFirst({ status: 'absent' });
  await wait();

  expect(seen.at(-1)).toEqual({ availability: 'available', ids: ['new-runtime'] });
});

test('replaces a full output snapshot and then appends incremental output', async () => {
  outputImpl = async (after) => after === undefined
    ? { schemaVersion: 1, revision: 5, reset: true, data: 'snapshot\n' }
    : { schemaVersion: 1, revision: 9, reset: false, data: 'increment\n' };
  const states: Array<{ data: string; stale: boolean }> = [];
  cleanups.push(observeOpenCodePtyOutput('pty-1', (state) => {
    states.push({ data: state.chunks.map((chunk) => chunk.data).join(''), stale: state.stale });
  }, 5));

  await wait(20);

  expect(outputCalls.slice(0, 2)).toEqual([undefined, 5]);
  expect(states.some((state) => state.data === 'snapshot\n' && !state.stale)).toBe(true);
  expect(states.some((state) => state.data === 'snapshot\nincrement\n' && !state.stale)).toBe(true);
});

test('restarts output polling on runtime switch and rejects the previous runtime response', async () => {
  let resolveFirst: (value: { schemaVersion: 1; revision: number; reset: boolean; data: string }) => void = () => undefined;
  const first = new Promise<{ schemaVersion: 1; revision: number; reset: boolean; data: string }>((resolve) => {
    resolveFirst = resolve;
  });
  let invocation = 0;
  outputImpl = () => {
    invocation += 1;
    if (invocation === 1) return first;
    return Promise.resolve({ schemaVersion: 1, revision: 2, reset: true, data: 'new runtime\n' });
  };
  const seen: string[] = [];
  cleanups.push(observeOpenCodePtyOutput('pty-1', (state) => {
    seen.push(state.chunks.map((chunk) => chunk.data).join(''));
  }, 1000));
  await wait();

  for (const listener of runtimeListeners) listener();
  await wait();
  resolveFirst({ schemaVersion: 1, revision: 1, reset: true, data: 'old runtime\n' });
  await wait();

  expect(outputCalls).toEqual([undefined, undefined]);
  expect(seen).toContain('new runtime\n');
  expect(seen).not.toContain('old runtime\n');
});
