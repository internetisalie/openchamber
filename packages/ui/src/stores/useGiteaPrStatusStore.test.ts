import { beforeEach, expect, mock, test } from 'bun:test';
import type { GiteaPullRequestStatus } from '@/lib/api/types';
import * as runtimeSwitch from '@/lib/runtime-switch';
import * as gitApi from '@/lib/gitApi';

let runtimeKey = 'runtime-a';
let remotes = ['origin'];
mock.module('@/lib/runtime-switch', () => ({ ...runtimeSwitch, getRuntimeKey: () => runtimeKey }));
mock.module('@/lib/gitApi', () => ({ ...gitApi, getRemotes: async () => remotes.map((name) => ({
  name, fetchUrl: `https://git.example.com/${name}/project.git`, pushUrl: `https://git.example.com/${name}/project.git`,
})) }));

const { createGiteaPrIdentity, getGiteaPrBranchKey, getGiteaPrIdentityKey, useGiteaPrStatusStore } =
  await import('./useGiteaPrStatusStore');

const repo = { instanceUrl: 'https://git.example.com', owner: 'alice', name: 'project', remote: 'origin' };
const status = (number: number): GiteaPullRequestStatus => ({
  repo,
  item: { kind: 'pr', number, title: `PR ${number}`, body: '',
    url: `https://git.example.com/alice/project/pulls/${number}`, state: 'open', author: 'alice' },
  pull: { draft: false, merged: false }, historyIncomplete: false,
});

beforeEach(() => {
  runtimeKey = 'runtime-a';
  remotes = ['origin'];
  useGiteaPrStatusStore.getState().resetForRuntimeSwitch();
});

test('PR keys distinguish runtime, instance, repository, and source remote', () => {
  const first = createGiteaPrIdentity('/repo', 'feature', repo);
  const otherInstance = createGiteaPrIdentity('/repo', 'feature', { ...repo, instanceUrl: 'https://other.example' });
  const otherSource = createGiteaPrIdentity('/repo', 'feature', repo, 'upstream');
  runtimeKey = 'runtime-b';
  const otherRuntime = createGiteaPrIdentity('/repo', 'feature', repo);
  expect(new Set([first, otherInstance, otherSource, otherRuntime].map(getGiteaPrIdentityKey)).size).toBe(4);
});

test('failed refresh retains the last confirmed PR and reports the error', async () => {
  const identity = createGiteaPrIdentity('/repo', 'feature', repo);
  const store = useGiteaPrStatusStore.getState();
  await store.refreshExact({ pullRequestStatus: async () => status(7) }, identity);
  await expect(store.refreshExact({ pullRequestStatus: async () => { throw new Error('offline'); } }, identity))
    .rejects.toThrow('offline');
  const key = getGiteaPrIdentityKey(identity);
  expect(useGiteaPrStatusStore.getState().entries[key]?.status?.item?.number).toBe(7);
  expect(useGiteaPrStatusStore.getState().entries[key]?.error).toBe('offline');
  expect(useGiteaPrStatusStore.getState().activeByBranch[getGiteaPrBranchKey('/repo', 'feature')]).toBe(key);
});

test('an older refresh cannot replace a newly created PR', async () => {
  const identity = createGiteaPrIdentity('/repo', 'feature', repo);
  let finish!: (result: GiteaPullRequestStatus) => void;
  const pending = new Promise<GiteaPullRequestStatus>((resolve) => { finish = resolve; });
  const store = useGiteaPrStatusStore.getState();
  const request = store.refreshExact({ pullRequestStatus: async () => pending }, identity);
  store.publish(identity, status(9));
  finish({ repo, item: null, pull: null, historyIncomplete: false });
  await request;
  expect(useGiteaPrStatusStore.getState().entries[getGiteaPrIdentityKey(identity)]?.status?.item?.number).toBe(9);
});

test('runtime switch rejects a late response from the old server', async () => {
  const identity = createGiteaPrIdentity('/repo', 'feature', repo);
  let finish!: (result: GiteaPullRequestStatus) => void;
  const pending = new Promise<GiteaPullRequestStatus>((resolve) => { finish = resolve; });
  const request = useGiteaPrStatusStore.getState().refreshExact({ pullRequestStatus: async () => pending }, identity);
  runtimeKey = 'runtime-b';
  useGiteaPrStatusStore.getState().resetForRuntimeSwitch();
  finish(status(7));
  await request;
  expect(useGiteaPrStatusStore.getState().entries).toEqual({});
});

test('sidebar discovery finds a fork PR and retains it when another remote fails', async () => {
  remotes = ['origin', 'upstream'];
  const upstream = { ...repo, owner: 'upstream', remote: 'upstream' };
  const api = {
    repository: async (_directory: string, remote?: string) => remote === 'upstream' ? upstream : repo,
    pullRequestStatus: async (_directory: string, _branch: string, remote: string, headRemote?: string) => {
      if (remote === 'upstream' && headRemote === 'origin') return { ...status(12), repo: upstream };
      return { repo: remote === 'upstream' ? upstream : repo, item: null, pull: null, historyIncomplete: false };
    },
  };
  const store = useGiteaPrStatusStore.getState();
  await store.refreshBranch(api, '/repo', 'feature');
  const active = useGiteaPrStatusStore.getState().activeByBranch[getGiteaPrBranchKey('/repo', 'feature')];
  expect(useGiteaPrStatusStore.getState().entries[active]?.summary?.number).toBe(12);
  expect(useGiteaPrStatusStore.getState().entries[active]?.identity.sourceRemote).toBe('origin');

  await store.refreshBranch({ ...api, pullRequestStatus: async () => { throw new Error('offline'); } },
    '/repo', 'feature', true);
  expect(useGiteaPrStatusStore.getState().entries[active]?.summary?.number).toBe(12);
  expect(useGiteaPrStatusStore.getState().entries[active]?.error).toBe('offline');
});

test('an open PR on another remote replaces historical PR status', async () => {
  remotes = ['origin', 'upstream'];
  const upstream = { ...repo, owner: 'upstream', remote: 'upstream' };
  const api = {
    repository: async (_directory: string, remote?: string) => remote === 'upstream' ? upstream : repo,
    pullRequestStatus: async (_directory: string, _branch: string, remote: string,
      headRemote?: string): Promise<GiteaPullRequestStatus> => {
      if (remote === 'origin' && headRemote === 'origin') {
        const closed = status(4);
        if (!closed.item) throw new Error('Invalid test fixture');
        return { ...closed, item: { ...closed.item, state: 'closed' },
          pull: { draft: false, merged: true } };
      }
      if (remote === 'upstream' && headRemote === 'origin') return { ...status(12), repo: upstream };
      return { repo: remote === 'upstream' ? upstream : repo, item: null, pull: null, historyIncomplete: false };
    },
  };
  await useGiteaPrStatusStore.getState().refreshBranch(api, '/repo', 'feature');
  const active = useGiteaPrStatusStore.getState().activeByBranch[getGiteaPrBranchKey('/repo', 'feature')];
  expect(useGiteaPrStatusStore.getState().entries[active]?.status?.item?.number).toBe(12);
});
