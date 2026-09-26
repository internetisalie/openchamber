import { useCallback, useEffect, useRef, useState } from 'react';
import type { GitHubPullRequestSummary, GiteaItem, GiteaRepository } from '@/lib/api/types';
import { getRemotes } from '@/lib/gitApi';
import type { PullRequestSource } from '@/lib/diff/pullRequestDiff';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useI18n } from '@/lib/i18n';
import { useGitStore } from '@/stores/useGitStore';
import { usePullRequestSelectionStore } from '@/stores/usePullRequestSelectionStore';
import { useGitHubAuthStore } from '@/stores/useGitHubAuthStore';
import { getFreshestPrStatusForBranch, getGitHubPrStatusKey, useGitHubPrStatusStore } from '@/stores/useGitHubPrStatusStore';
import { useRuntimeAPIs } from './useRuntimeAPIs';
import { useDebouncedValue } from './useDebouncedValue';

type PullRequestList =
  | { key: string; status: 'loading' }
  | { key: string; status: 'ready'; prs: GitHubPullRequestSummary[]; page: number; hasMore: boolean; error: string | null }
  | { key: string; status: 'error'; message: string };
const NO_PULL_REQUESTS: GitHubPullRequestSummary[] = [];
const NO_GITEA_REPOSITORIES: GiteaRepository[] = [];

export function usePullRequestComparison(directory: string | null, branch: string | null, enabled: boolean, preferredSource?: PullRequestSource) {
  const { github, gitea } = useRuntimeAPIs();
  const { t } = useI18n();
  const runtimeKey = useGitStore((state) => state.runtimeKey);
  const selectionKey = JSON.stringify([runtimeKey, directory, branch]);
  const selection = usePullRequestSelectionStore((state) => state.selections.get(selectionKey) ?? null);
  const selectedSource = selection?.source ?? null;
  const saveSelection = usePullRequestSelectionStore((state) => state.select);
  const acceptHandoff = usePullRequestSelectionStore((state) => state.acceptHandoff);
  const pendingPreference = preferredSource && selection?.handoff !== preferredSource
    ? preferredSource : null;
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query, 350).trim();
  const key = JSON.stringify([selectionKey, search]);
  const [list, setList] = useState<PullRequestList | null>(null);
  const listRef = useRef(list);
  listRef.current = list;
  const [loadingMore, setLoadingMore] = useState(false);
  const [giteaRepositories, setGiteaRepositories] = useState<{ key: string; values: GiteaRepository[] } | null>(null);
  const [giteaList, setGiteaList] = useState<{ key: string; items: Array<{ item: GiteaItem;
    repo: GiteaRepository }>; page: number; hasMore: boolean; error: string | null } | null>(null);
  const [giteaLoading, setGiteaLoading] = useState(false);
  const giteaRequestId = useRef(0);
  const requestId = useRef(0);
  const owner = useRef({ key, enabled });
  owner.current = { key, enabled };
  const githubConnected = useGitHubAuthStore((state) => state.status?.connected ?? false);
  const githubAuthChecked = useGitHubAuthStore((state) => state.hasChecked);
  const branchPr = useGitHubPrStatusStore((state) => directory && branch
    ? getFreshestPrStatusForBranch(state.entries, directory, branch) : null);
  const repoKey = JSON.stringify([runtimeKey, directory]);
  const currentGiteaRepositories = giteaRepositories?.key === repoKey ? giteaRepositories.values : NO_GITEA_REPOSITORIES;
  const giteaKey = JSON.stringify([repoKey, search, currentGiteaRepositories.map((repo) => [
    repo.instanceUrl, repo.owner, repo.name, repo.remote])]);

  useEffect(() => {
    if (!enabled || !directory || !gitea) return;
    let active = true;
    void getRemotes(directory).then(async (remotes) => {
      const results = await Promise.allSettled(remotes.map((remote) => gitea.repository(directory, remote.name)));
      if (!active) return;
      const values = results.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);
      setGiteaRepositories({ key: repoKey, values });
    }).catch(() => { if (active) setGiteaRepositories({ key: repoKey, values: [] }); });
    return () => { active = false; };
  }, [directory, enabled, gitea, repoKey]);

  const refreshGitea = useCallback(async (page = 1) => {
    if (!enabled || !directory || !gitea || currentGiteaRepositories.length === 0) return;
    const id = ++giteaRequestId.current;
    setGiteaLoading(true);
    const previous = page > 1 && giteaList?.key === giteaKey ? giteaList.items : [];
    try {
      const results = await Promise.allSettled(currentGiteaRepositories.map((repo) =>
        gitea.items(directory, 'pr', { page, remote: repo.remote, query: search || undefined })));
      if (id !== giteaRequestId.current) return;
      const errors = results.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
      const items = results.flatMap((result) => result.status === 'fulfilled'
        ? result.value.items.map((item) => ({ item, repo: result.value.repo })) : []);
      const merged = new Map([...previous, ...items].map((entry) => [JSON.stringify([
        entry.repo.instanceUrl, entry.repo.owner, entry.repo.name, entry.repo.remote, entry.item.number]), entry]));
      setGiteaList({ key: giteaKey, items: [...merged.values()], page,
        hasMore: results.some((result) => result.status === 'fulfilled' && result.value.hasMore),
        error: errors.length ? String(errors[0] instanceof Error ? errors[0].message : errors[0]) : null });
    } catch (error) {
      if (id === giteaRequestId.current) setGiteaList({ key: giteaKey, items: previous, page: page - 1,
        hasMore: true, error: error instanceof Error ? error.message : String(error) });
    } finally { if (id === giteaRequestId.current) setGiteaLoading(false); }
  }, [enabled, directory, gitea, currentGiteaRepositories, giteaList, giteaKey, search]);

  useEffect(() => {
    if (!enabled || currentGiteaRepositories.length === 0 || giteaList?.key === giteaKey) return;
    void refreshGitea();
    return () => { giteaRequestId.current += 1; };
  }, [enabled, giteaKey, currentGiteaRepositories.length, giteaList?.key, refreshGitea]);

  // Use the existing fork/remote-aware resolver, not a matching head name in
  // the list: another contributor can have a branch with the same name.
  useEffect(() => {
    if (!enabled || !directory || !branch || selectedSource || !githubAuthChecked || !githubConnected) return;
    const store = useGitHubPrStatusStore.getState();
    const statusKey = getGitHubPrStatusKey(directory, branch);
    store.ensureEntry(statusKey);
    store.setParams(statusKey, { directory, branch, remoteName: null, canShow: true, github, githubAuthChecked, githubConnected });
    void store.refreshTargets([{ directory, branch, remoteName: null }]);
  }, [branch, directory, enabled, github, githubAuthChecked, githubConnected, selectedSource]);

  useEffect(() => {
    if (!enabled || !githubConnected || !branchPr?.pr || !branchPr.repo || usePullRequestSelectionStore.getState().selections.has(selectionKey)) return;
    saveSelection(selectionKey, { kind: 'pr', number: branchPr.pr.number,
      sourceRepo: { owner: branchPr.repo.owner, repo: branchPr.repo.repo } });
  }, [branchPr, enabled, githubConnected, saveSelection, selectionKey]);

  useEffect(() => {
    if (preferredSource) acceptHandoff(selectionKey, preferredSource);
  }, [acceptHandoff, preferredSource, selectionKey]);

  const refresh = useCallback(async (previous?: Extract<PullRequestList, { status: 'ready' }>) => {
    if (!directory || !enabled || owner.current.key !== key || !owner.current.enabled) return;
    const id = ++requestId.current;
    const runtime = getRuntimeKey();
    if (previous) setLoadingMore(true);
    else {
      setLoadingMore(false);
      setList({ key, status: 'loading' });
    }
    try {
      if (!github) throw new Error(t('session.githubPrPicker.error.runtimeUnavailable'));
      const page = previous ? previous.page + 1 : 1;
      const result = await github.prsList(directory, { page, query: search || undefined });
      if (!result.connected) throw new Error(t('session.githubPrPicker.empty.notConnected'));
      if (!result.prs || !result.repo) throw new Error(t('session.githubPrPicker.error.repoNotResolvable'));
      if (requestId.current !== id || getRuntimeKey() !== runtime || owner.current.key !== key || !owner.current.enabled) return;
      const repo = result.repo;
      const prs = result.prs.map((pr) => ({ ...pr, sourceRepo: pr.sourceRepo ?? { owner: repo.owner, repo: repo.repo, source: 'repository' } }));
      const merged = new Map([...(previous?.prs ?? []), ...prs].map((pr) => [`${pr.sourceRepo?.owner}/${pr.sourceRepo?.repo}#${pr.number}`, pr]));
      setList({ key, status: 'ready', prs: [...merged.values()], page, hasMore: Boolean(result.hasMore), error: null });
    } catch (error) {
      if (requestId.current === id && getRuntimeKey() === runtime && owner.current.key === key && owner.current.enabled) {
        const message = error instanceof Error ? error.message : t('session.githubPrPicker.toast.loadMoreFailed');
        setList(previous ? { ...previous, error: message } : { key, status: 'error', message });
      }
    } finally {
      if (requestId.current === id) setLoadingMore(false);
    }
  }, [directory, enabled, github, key, search, t]);

  useEffect(() => {
    if (listRef.current?.key !== key || listRef.current.status !== 'ready') void refresh();
    return () => { requestId.current += 1; };
  }, [key, refresh]);
  const current = list?.key === key ? list : null;
  return {
    enabled,
    selectedSource: pendingPreference ?? selectedSource,
    prs: current?.status === 'ready' ? current.prs : NO_PULL_REQUESTS,
    giteaPrs: giteaList?.key === giteaKey ? giteaList.items : [],
    giteaLoading,
    giteaError: giteaList?.key === giteaKey ? giteaList.error : null,
    giteaHasMore: giteaList?.key === giteaKey && giteaList.hasMore,
    query, setQuery,
    loading: enabled && (!current || current.status === 'loading' || search !== query.trim()),
    loadingMore,
    hasMore: current?.status === 'ready' && current.hasMore,
    error: current?.status === 'error' ? current.message : current?.status === 'ready' ? current.error : null,
    refresh: () => Promise.all([refresh(), refreshGitea()]),
    loadMore: () => Promise.all([
      current?.status === 'ready' && current.hasMore && !loadingMore ? refresh(current) : Promise.resolve(),
      giteaList?.key === giteaKey && giteaList.hasMore && !giteaLoading
        ? refreshGitea(giteaList.page + 1) : Promise.resolve(),
    ]),
    selectGitea: (entry: { item: GiteaItem; repo: GiteaRepository }) => {
      saveSelection(selectionKey, { kind: 'pr', number: entry.item.number,
        gitea: { instanceUrl: entry.repo.instanceUrl, owner: entry.repo.owner,
          repo: entry.repo.name, remote: entry.repo.remote } });
    },
    select: (pr: GitHubPullRequestSummary) => {
      if (!pr.sourceRepo) return;
      saveSelection(selectionKey, { kind: 'pr', number: pr.number, sourceRepo: { owner: pr.sourceRepo.owner, repo: pr.sourceRepo.repo } });
    },
  };
}
