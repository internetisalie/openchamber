import { expect, test } from 'bun:test';
import { FilesystemError } from '@/lib/api/files-errors';
import { dispatchSessionKey } from './dispatch-projection';
import { loadDispatchProjections, planDispatchProjectionReads } from './dispatch-projection-loader';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

test('plans exact session directories only, deduplicates selectors and caps the read set', () => {
  const targets = planDispatchProjectionReads([{ id: 'one', directory: '/container/checkout' }, { id: 'one', directory: '/container/checkout' }]);
  expect(targets).toEqual([{ directory: '/container/checkout', sessionID: 'one' }, { directory: '/container/checkout' }]);
  expect(targets.some((target) => target.directory === '/container')).toBe(false);
  const many = planDispatchProjectionReads(Array.from({ length: 1000 }, (_, n) => ({ id: `ses_${n}`, directory: `/container/${n % 100}` })));
  expect(many.filter((target) => target.sessionID === undefined)).toHaveLength(64);
  expect(many.filter((target) => target.sessionID !== undefined)).toHaveLength(256);
});

test('keeps at most two reads in flight and requests each native alias once per scope', async () => {
  const gate = deferred();
  const started = deferred();
  let inFlight = 0;
  let peak = 0;
  const calls: string[] = [];
  const targets = planDispatchProjectionReads([{ id: 'one', directory: '/container' }, { id: 'two', directory: '/container' }]);
  const pending = loadDispatchProjections({ source: 'source-a', targets: [...targets, targets[0]], signal: new AbortController().signal,
    isCurrent: () => true, files: { readNativeFile: async (path) => {
      calls.push(path); inFlight++; peak = Math.max(peak, inFlight);
      if (inFlight === 2) started.resolve();
      await gate.promise;
      inFlight--;
      return { status: 'missing' };
    } } });
  await started.promise;
  expect(calls).toHaveLength(2);
  gate.resolve();
  const result = await pending;
  expect(peak).toBe(2);
  expect(new Set(calls).size).toBe(3);
  expect(result?.status).toBe('scoped');
});

test('retains independent successes and never fills missing historical context from the default', async () => {
  const context = { container: '/runtime', lane: 'loom.location', item: null, phase: null };
  const result = await loadDispatchProjections({ source: 'source-a',
    targets: planDispatchProjectionReads([{ id: 'old', directory: '/container' }, { id: 'denied', directory: '/container' }]),
    signal: new AbortController().signal, isCurrent: () => true, files: { readNativeFile: async (path) => {
      if (path.includes('/denied.json')) throw new FilesystemError('Excluded', { reason: 'excluded-path' });
      if (path.includes('/old.json')) return { status: 'read', content: JSON.stringify({ schema: 'loom.dispatch-projection.v1',
        status: 'legacy-unknown', workspace: '/container', sessionID: 'old', agent: 'planner' }) };
      return { status: 'read', content: JSON.stringify({ schema: 'loom.dispatch-projection.v1', status: 'known', workspace: '/container', context }) };
    } } });
  if (result?.status !== 'scoped') throw new Error('Scoped result required');
  expect(result.workspaces.get('/container')).toMatchObject({ status: 'known', context });
  expect(result.sessions.get(dispatchSessionKey('/container', 'old'))).toMatchObject({ status: 'legacy-unknown', agent: 'planner' });
  expect(result.sessions.get(dispatchSessionKey('/container', 'old'))).not.toHaveProperty('context');
  expect(result.sessions.get(dispatchSessionKey('/container', 'denied'))).toEqual({ status: 'refused' });
});

test('scope cancellation and runtime round trips discard results and stop queued reads', async () => {
  for (const cancel of [true, false]) {
    const gate = deferred();
    const started = deferred();
    const controller = new AbortController();
    let current = true;
    let calls = 0;
    const pending = loadDispatchProjections({ source: 'source-a',
      targets: planDispatchProjectionReads([{ id: 'one', directory: '/container' }, { id: 'two', directory: '/container' }]),
      signal: controller.signal, isCurrent: () => current, files: { readNativeFile: async () => {
        if (++calls === 2) started.resolve();
        await gate.promise;
        return { status: 'missing' };
      } } });
    await started.promise;
    if (cancel) controller.abort(); else current = false;
    gate.resolve();
    expect(await pending).toBeNull();
    expect(calls).toBe(2);
  }
});

test('native source-generation changes invalidate the entire batch, including earlier successes', async () => {
  const result = await loadDispatchProjections({ source: 'source-a', targets: [{ directory: '/container' }, { directory: '/container', sessionID: 'one' }],
    signal: new AbortController().signal, isCurrent: () => true, files: { readNativeFile: async (path) => {
      if (path.includes('session-projection')) throw new FilesystemError('Changed', { reason: 'remote-source-changed' });
      return { status: 'read', content: JSON.stringify({ schema: 'loom.dispatch-projection.v1', status: 'known', workspace: '/container',
        context: { container: '/runtime', lane: 'loom.location', item: null, phase: null } }) };
    } } });
  if (result?.status !== 'scoped') throw new Error('Scoped result required');
  expect(result.workspaces.get('/container')).toEqual({ status: 'stale' });
  expect(result.sessions.get(dispatchSessionKey('/container', 'one'))).toEqual({ status: 'stale' });
});
