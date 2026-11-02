import { expect, test } from 'bun:test';
import { FilesystemError } from '@/lib/api/files-errors';
import { parseDispatchProjection, readDispatchProjection } from './dispatch-projection';

const workspace = '/published/container';
const context = { container: '/runtime/container', lane: 'loom.location',
  item: { repository: 'forge.example/loom', subPath: 'register/tasks', id: 'TASK-1' }, phase: { selector: 'phase 2: sidebar' } };
const known = { schema: 'loom.dispatch-projection.v1', status: 'known', workspace, sessionID: 'ses_one', agent: 'implementer', context };

test('accepts the supplied v1 contract with qualified item, exact phase and a different producer container namespace', () => {
  expect(parseDispatchProjection(JSON.stringify(known), workspace, 'ses_one')).toEqual(known);
  expect(parseDispatchProjection(JSON.stringify({ ...known, context: { ...context, item: null, phase: null } }), workspace, 'ses_one'))
    .toMatchObject({ status: 'known', context: { item: null, phase: null } });
});

test('keeps legacy unknown, absent and explicit chore separate, and preserves only captured agent', () => {
  const legacy = { schema: 'loom.dispatch-projection.v1', status: 'legacy-unknown', workspace, sessionID: 'ses_one', agent: 'reviewer' };
  expect(parseDispatchProjection(JSON.stringify(legacy), workspace, 'ses_one')).toEqual(legacy);
  const missing = { schema: 'loom.dispatch-projection.v1', status: 'missing', workspace, sessionID: 'ses_one' };
  expect(parseDispatchProjection(JSON.stringify(missing), workspace, 'ses_one')).toEqual(missing);
  expect(parseDispatchProjection(JSON.stringify({ ...missing, agent: 'coder' }), workspace, 'ses_one')).toEqual({ status: 'invalid' });
  expect(parseDispatchProjection(JSON.stringify({ ...legacy, context: null }), workspace, 'ses_one')).toEqual({ status: 'invalid' });
});

test('rejects identity conflicts, missing context members, extra raw data and malformed discriminators', () => {
  for (const invalid of [
    { ...known, workspace: '/elsewhere' }, { ...known, sessionID: 'another' },
    { ...known, context: null }, { ...known, context: { container: '/runtime/container', lane: 'loom.location', phase: null } },
    { ...known, context: { ...context, phase: { selector: '' } } },
    { ...known, context: { ...context, lane: 'inferred-from-title' } },
    { ...known, permissions: [] }, { ...known, context: { ...context, phase: { selector: 'phase 1', briefingPath: '/private' } } },
  ]) expect(parseDispatchProjection(JSON.stringify(invalid), workspace, 'ses_one')).toEqual({ status: 'invalid' });
  expect(parseDispatchProjection(JSON.stringify(known), workspace)).toEqual({ status: 'invalid' });
  expect(parseDispatchProjection(JSON.stringify({ ...known, sessionID: undefined, agent: undefined }), workspace, 'ses_one')).toEqual({ status: 'invalid' });
});

test('requires a supported marker and bounds UTF-8 bytes, duplicate keys and trailing data', () => {
  expect(parseDispatchProjection('{}', workspace)).toEqual({ status: 'unsupported' });
  expect(parseDispatchProjection(JSON.stringify({ ...known, schema: 'loom.dispatch-projection.v2' }), workspace, 'ses_one')).toEqual({ status: 'unsupported' });
  for (const text of ['{', `${JSON.stringify(known)} {}`, JSON.stringify(known).replace('"status":"known"', '"status":"missing","status":"known"'),
    JSON.stringify(known).replace('"agent":"implementer"', '"AGENT":"reviewer","agent":"implementer"'),
    JSON.stringify({ ...known, context: { ...context, phase: { selector: '界'.repeat(6000) } } })]) {
    expect(parseDispatchProjection(text, workspace, 'ses_one')).toEqual({ status: 'invalid' });
  }
});

test('selects only generated bounded aliases with the exact native session selector', async () => {
  const calls: { path: string; directory: string; limit?: number }[] = [];
  const signal = new AbortController().signal;
  const files = { readNativeFile: async (path: string, options: { directory: string; maxBytes?: number }) => {
    calls.push({ path, directory: options.directory, limit: options.maxBytes });
    return { status: 'read' as const, content: JSON.stringify(path.includes('session-projection') ? known
      : { schema: known.schema, status: known.status, workspace, context }) };
  } };
  expect((await readDispatchProjection(files, workspace, 'ses_one', signal, () => true)).status).toBe('known');
  expect((await readDispatchProjection(files, workspace, undefined, signal, () => true)).status).toBe('known');
  expect(calls).toEqual([
    { path: '.supervisor/dispatch-session-projection/ses_one.json', directory: workspace, limit: 16384 },
    { path: '.supervisor/dispatch-workspace-projection.json', directory: workspace, limit: 16384 },
  ]);
  expect(await readDispatchProjection(files, workspace, '../other', signal, () => true)).toEqual({ status: 'invalid' });
  expect(calls).toHaveLength(2);
});

test('preserves missing, older Agent exclusion, unsupported capability, malformed source and transport failures', async () => {
  const signal = new AbortController().signal;
  expect(await readDispatchProjection({}, workspace, 'ses_one', signal, () => true)).toEqual({ status: 'unsupported' });
  for (const [reason, status] of [['excluded-path', 'refused'], ['dispatch-invalid', 'invalid'], ['remote-unavailable', 'failed'],
    ['remote-source-changed', 'stale']] as const) {
    expect(await readDispatchProjection({ readNativeFile: async () => { throw new FilesystemError('Fixture refusal', { reason }); } },
      workspace, 'ses_one', signal, () => true)).toEqual({ status });
  }
  expect(await readDispatchProjection({ readNativeFile: async () => ({ status: 'missing' }) }, workspace, 'ses_one', signal, () => true))
    .toEqual({ status: 'unsupported' });
  expect(await readDispatchProjection({ readNativeFile: async () => ({ status: 'read', content: JSON.stringify({
    schema: 'loom.dispatch-projection.v1', status: 'missing', workspace, sessionID: 'ses_one',
  }) }) }, workspace, 'ses_one', signal, () => true)).toMatchObject({ status: 'missing', sessionID: 'ses_one', workspace });
});

test('rejects cancelled or obsolete completions without consuming their historical context', async () => {
  const controller = new AbortController();
  const cancelled = await readDispatchProjection({ readNativeFile: async () => {
    controller.abort(); return { status: 'read', content: JSON.stringify(known) };
  } }, workspace, 'ses_one', controller.signal, () => true);
  expect(cancelled).toEqual({ status: 'cancelled' });
  let current = true;
  const stale = await readDispatchProjection({ readNativeFile: async () => {
    current = false; return { status: 'read', content: JSON.stringify(known) };
  } }, workspace, 'ses_one', new AbortController().signal, () => current);
  expect(stale).toEqual({ status: 'stale' });
});
