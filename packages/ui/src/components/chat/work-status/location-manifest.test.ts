import { expect, test } from 'bun:test';
import type { FilesAPI } from '@/lib/api/types';
import { readLocationManifest } from './location-manifest';

const directory = '/work/example';
// Fields follow checkout/manifest.go at loom-delivery 48b143b. All values are synthetic.
const member = (role: 'project' | 'base' | 'adjunct', dir: string) => ({
  role, dir, repo: `example/${dir}`, origin: { mode: 'clone', remote: `https://forge.example/example/${dir}.git` },
  pin: { sha: 'a'.repeat(40), ref: 'refs/heads/main', branch: 'poc/location' },
  identity: { name: 'Example Developer', email: 'developer@example.test' },
});
const manifest = () => ({ version: 1, container: directory,
  members: [member('project', 'app'), member('base', 'base'), member('adjunct', 'reference')],
  seats: ['implementer'], steps: null, model_overrides: ['example.model=example/model'],
});
const files = (readNativeFile?: FilesAPI['readNativeFile']): FilesAPI => ({
  readNativeFile,
  listDirectory: async () => ({ directory, entries: [] }),
  search: async () => [],
  createDirectory: async (path) => ({ path, success: true }),
});
const load = (value: unknown) => readLocationManifest(files(async () => ({ status: 'read', content: JSON.stringify(value) })),
  directory, new AbortController().signal);

test('native read names only the selected container and exact manifest; projection excludes identity and seats', async () => {
  const signal = new AbortController().signal;
  const state = await readLocationManifest(files(async (path, options) => {
    expect(path).toBe('.supervisor/manifest.json');
    expect(options).toEqual({ directory: '/work/example', signal });
    return { status: 'read', content: JSON.stringify(manifest()) };
  }), directory, signal);
  expect(state.status).toBe('ready');
  if (state.status !== 'ready') throw new Error('Expected parsed manifest');
  expect(state.manifest.members.map(({ role, dir }) => [role, dir])).toEqual([
    ['project', 'app'], ['base', 'base'], ['adjunct', 'reference'],
  ]);
  expect(state.manifest).not.toHaveProperty('seats');
  expect(state.manifest).not.toHaveProperty('model_overrides');
  expect(state.manifest.members[0]).not.toHaveProperty('identity');
});

test('missing, unsupported, read failure, and malformed content stay distinct', async () => {
  const signal = new AbortController().signal;
  expect(await readLocationManifest(files(async () => ({ status: 'missing' })), directory, signal)).toEqual({ status: 'missing' });
  expect(await readLocationManifest(files(), directory, signal)).toEqual({ status: 'unsupported' });
  expect(await readLocationManifest(files(async () => { throw new Error('offline'); }), directory, signal)).toEqual({ status: 'failed' });
  for (const content of ['', '{', '{}', 'null']) {
    expect(await readLocationManifest(files(async () => ({ status: 'read', content })), directory, signal)).toEqual({ status: 'invalid' });
  }
});

test('rejects a different container, including a parent or normalized lookalike', async () => {
  for (const container of ['/work', '/work/other', '/work/example/', '/work/example/../example']) {
    expect(await load({ ...manifest(), container })).toEqual({ status: 'invalid' });
  }
});

test('rejects escaping, ambiguous, duplicate, or overlapping member directories', async () => {
  for (const dir of ['../app', '/app', '.', 'a/../app', 'a//app', 'a\\app', 'C:app', 'a\0app', 'base', 'base/nested']) {
    const value = manifest();
    value.members[0].dir = dir;
    expect(await load(value)).toEqual({ status: 'invalid' });
  }
});

test('rejects unknown version, bad pins, and invalid role cardinality', async () => {
  expect(await load({ ...manifest(), version: 2 })).toEqual({ status: 'invalid' });
  const badPin = manifest();
  badPin.members[0].pin.sha = 'main';
  expect(await load(badPin)).toEqual({ status: 'invalid' });
  expect(await load({ ...manifest(), members: [member('project', 'app')] })).toEqual({ status: 'invalid' });
  expect(await load({ ...manifest(), members: [member('project', 'app'), member('project', 'other'), member('base', 'base')] }))
    .toEqual({ status: 'invalid' });
});
