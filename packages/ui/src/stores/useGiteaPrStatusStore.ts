import { create } from 'zustand';
import type { GiteaAPI, GiteaPullRequestStatus, GiteaRepository } from '@/lib/api/types';
import { getRemotes } from '@/lib/gitApi';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { runBackgroundNetworkTask } from '@/lib/background-network';
import type { PrVisualSummary } from './useGitHubPrStatusStore';

const DISCOVERY_INTERVAL_MS = 2 * 60_000;
const MAX_STATUS_LOOKUPS = 12;

interface GiteaPrIdentity {
  runtimeKey: string;
  directory: string;
  branch: string;
  instanceUrl: string;
  owner: string;
  repo: string;
  remote: string;
  sourceRemote: string;
}

interface GiteaPrEntry {
  identity: GiteaPrIdentity;
  status: GiteaPullRequestStatus | null;
  summary: PrVisualSummary | null;
  error: string | null;
  lastSuccessAt: number;
}

interface GiteaPrStatusStore {
  entries: Record<string, GiteaPrEntry>;
  activeByBranch: Record<string, string>;
  activate: (identity: GiteaPrIdentity) => void;
  publish: (identity: GiteaPrIdentity, status: GiteaPullRequestStatus) => void;
  reportError: (identity: GiteaPrIdentity, error: Error) => void;
  refreshExact: (gitea: Pick<GiteaAPI, 'pullRequestStatus'>, identity: GiteaPrIdentity) => Promise<GiteaPullRequestStatus>;
  refreshBranch: (gitea: Pick<GiteaAPI, 'repository' | 'pullRequestStatus'>,
    directory: string, branch: string, force?: boolean) => Promise<void>;
  resetForRuntimeSwitch: () => void;
}

export const getGiteaPrBranchKey = (directory: string, branch: string): string =>
  JSON.stringify([getRuntimeKey(), directory, branch]);

export const getGiteaPrIdentityKey = (identity: GiteaPrIdentity): string => JSON.stringify([
  'gitea', identity.runtimeKey, identity.directory, identity.branch, identity.instanceUrl,
  identity.owner, identity.repo, identity.remote, identity.sourceRemote,
]);

export const createGiteaPrIdentity = (
  directory: string, branch: string, repo: GiteaRepository, sourceRemote = repo.remote,
): GiteaPrIdentity => ({
  runtimeKey: getRuntimeKey(), directory, branch, instanceUrl: repo.instanceUrl,
  owner: repo.owner, repo: repo.name, remote: repo.remote, sourceRemote,
});

const summaryFromStatus = (status: GiteaPullRequestStatus): PrVisualSummary | null => {
  const item = status.item;
  if (!item) return null;
  const draft = status.pull?.draft === true ||
    (status.pull?.draft === null && /^(?:WIP:|\[WIP\])/i.test(item.title));
  const visualState = item.state === 'closed'
    ? status.pull?.merged === true ? 'merged' : 'closed'
    : draft ? 'draft' : 'open';
  return {
    number: item.number, visualState, prState: status.pull?.merged === true ? 'merged' : item.state,
    draft, title: item.title, url: item.url, base: null, head: null, checks: null,
    canMerge: null, mergeableState: null, repo: { owner: status.repo.owner, repo: status.repo.name },
  };
};

const sameRepository = (identity: GiteaPrIdentity, repo: GiteaRepository): boolean =>
  identity.instanceUrl === repo.instanceUrl && identity.owner === repo.owner &&
  identity.repo === repo.name && identity.remote === repo.remote;

const inFlightByBranch = new Map<string, Promise<void>>();
const lastAttemptByBranch = new Map<string, number>();
const entryRevision = new Map<string, number>();
let generation = 0;

export const useGiteaPrStatusStore = create<GiteaPrStatusStore>((set, get) => ({
  entries: {},
  activeByBranch: {},
  activate: (identity) => set((state) => ({
    activeByBranch: { ...state.activeByBranch,
      [getGiteaPrBranchKey(identity.directory, identity.branch)]: getGiteaPrIdentityKey(identity) },
  })),
  publish: (identity, status) => {
    if (identity.runtimeKey !== getRuntimeKey() || !sameRepository(identity, status.repo)) return;
    const key = getGiteaPrIdentityKey(identity);
    entryRevision.set(key, (entryRevision.get(key) ?? 0) + 1);
    set((state) => ({
      activeByBranch: { ...state.activeByBranch,
        [getGiteaPrBranchKey(identity.directory, identity.branch)]: key },
      entries: { ...state.entries, [key]: {
        identity, status, summary: summaryFromStatus(status), error: null, lastSuccessAt: Date.now(),
      } },
    }));
  },
  reportError: (identity, error) => {
    if (identity.runtimeKey !== getRuntimeKey()) return;
    const key = getGiteaPrIdentityKey(identity);
    set((state) => ({ entries: { ...state.entries, [key]: {
      identity, status: state.entries[key]?.status ?? null,
      summary: state.entries[key]?.summary ?? null,
      lastSuccessAt: state.entries[key]?.lastSuccessAt ?? 0, error: error.message,
    } } }));
  },
  refreshExact: async (gitea, identity) => {
    get().activate(identity);
    const key = getGiteaPrIdentityKey(identity);
    const branchKey = getGiteaPrBranchKey(identity.directory, identity.branch);
    const revision = entryRevision.get(key) ?? 0;
    try {
      const status = await gitea.pullRequestStatus(identity.directory, identity.branch,
        identity.remote, identity.sourceRemote);
      if (!sameRepository(identity, status.repo)) throw new Error('The Gitea repository changed during PR lookup');
      if (get().activeByBranch[branchKey] === key && (entryRevision.get(key) ?? 0) === revision) {
        get().publish(identity, status);
      }
      return status;
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught));
      if (get().activeByBranch[branchKey] === key && (entryRevision.get(key) ?? 0) === revision) {
        get().reportError(identity, error);
      }
      throw error;
    }
  },
  refreshBranch: async (gitea, directory, branch, force = false) => {
    const branchKey = getGiteaPrBranchKey(directory, branch);
    const existing = inFlightByBranch.get(branchKey);
    if (existing) {
      await existing;
      if (!force) return;
    }
    const now = Date.now();
    if (!force && now - (lastAttemptByBranch.get(branchKey) ?? 0) < DISCOVERY_INTERVAL_MS) return;
    lastAttemptByBranch.set(branchKey, now);
    const currentGeneration = generation;
    let activeAtStart: string | undefined = get().activeByBranch[branchKey];
    let revisionAtStart = activeAtStart ? entryRevision.get(activeAtStart) ?? 0 : 0;
    const request = (async () => {
      try {
        const remotes = await runBackgroundNetworkTask(() => getRemotes(directory));
        const resolved = await Promise.allSettled(remotes.map((remote) =>
          runBackgroundNetworkTask(() => gitea.repository(directory, remote.name))));
        if (generation !== currentGeneration) return;
        const repositories = resolved.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);
        if (repositories.length === 0) {
          const failed = resolved.find((result) => result.status === 'rejected');
          if (failed?.status === 'rejected') throw failed.reason;
          set((state) => {
            const next = { ...state.activeByBranch };
            delete next[branchKey];
            return { activeByBranch: next };
          });
          return;
        }
        const candidates = repositories.flatMap((target) => repositories
          .filter((source) => source.instanceUrl === target.instanceUrl && source.name === target.name)
          .map((source) => createGiteaPrIdentity(directory, branch, target, source.remote)));
        if (activeAtStart && resolved.every((result) => result.status === 'fulfilled') &&
            !candidates.some((candidate) => getGiteaPrIdentityKey(candidate) === activeAtStart)) {
          set((state) => {
            const next = { ...state.activeByBranch };
            if (next[branchKey] === activeAtStart) delete next[branchKey];
            return { activeByBranch: next };
          });
          activeAtStart = undefined;
          revisionAtStart = 0;
        }
        const activeKey = get().activeByBranch[branchKey];
        candidates.sort((a, b) => Number(getGiteaPrIdentityKey(b) === activeKey)
          - Number(getGiteaPrIdentityKey(a) === activeKey));
        let empty: { identity: GiteaPrIdentity; status: GiteaPullRequestStatus } | null = null;
        let historical: { identity: GiteaPrIdentity; status: GiteaPullRequestStatus } | null = null;
        const failedRemote = resolved.find((result) => result.status === 'rejected');
        let firstError: Error | null = failedRemote?.status === 'rejected'
          ? failedRemote.reason instanceof Error ? failedRemote.reason : new Error(String(failedRemote.reason)) : null;
        for (const identity of candidates.slice(0, MAX_STATUS_LOOKUPS)) {
          try {
            const status = await runBackgroundNetworkTask(() =>
              gitea.pullRequestStatus(directory, branch, identity.remote, identity.sourceRemote));
            if (generation !== currentGeneration) return;
            if (!sameRepository(identity, status.repo)) throw new Error('The Gitea repository changed during PR lookup');
            if (status.item) {
              if (status.item.state === 'closed') {
                historical ??= { identity, status };
                continue;
              }
              if (get().activeByBranch[branchKey] !== activeAtStart ||
                  (activeAtStart && (entryRevision.get(activeAtStart) ?? 0) !== revisionAtStart)) return;
              get().publish(identity, status);
              return;
            }
            empty ??= { identity, status };
          } catch (caught) {
            firstError ??= caught instanceof Error ? caught : new Error(String(caught));
          }
        }
        if (generation !== currentGeneration) return;
        if (firstError) throw firstError;
        if (candidates.length > MAX_STATUS_LOOKUPS) throw new Error('Too many Gitea remotes to check for this branch');
        const result = historical ?? empty;
        if (result && get().activeByBranch[branchKey] === activeAtStart &&
            (!activeAtStart || (entryRevision.get(activeAtStart) ?? 0) === revisionAtStart)) {
          get().publish(result.identity, result.status);
        }
      } catch (caught) {
        if (generation !== currentGeneration) return;
        const activeKey = get().activeByBranch[branchKey];
        const identity = activeKey ? get().entries[activeKey]?.identity : null;
        if (identity) get().reportError(identity, caught instanceof Error ? caught : new Error(String(caught)));
      }
    })();
    inFlightByBranch.set(branchKey, request);
    try { await request; } finally { if (inFlightByBranch.get(branchKey) === request) inFlightByBranch.delete(branchKey); }
  },
  resetForRuntimeSwitch: () => {
    generation++;
    inFlightByBranch.clear();
    lastAttemptByBranch.clear();
    entryRevision.clear();
    set({ entries: {}, activeByBranch: {} });
  },
}));

export const useGiteaPrVisualSummary = (directory: string | null, branch: string | null): PrVisualSummary | null =>
  useGiteaPrStatusStore((state) => {
    if (!directory || !branch) return null;
    const key = state.activeByBranch[getGiteaPrBranchKey(directory, branch)];
    return key ? state.entries[key]?.summary ?? null : null;
  });

export const useGiteaPrIsActive = (directory: string | null, branch: string | null): boolean =>
  useGiteaPrStatusStore((state) => Boolean(directory && branch &&
    state.activeByBranch[getGiteaPrBranchKey(directory, branch)]));
