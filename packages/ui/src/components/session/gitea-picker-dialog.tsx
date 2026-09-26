import React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { useNestedGitDirectory } from '@/hooks/useNestedGitDirectory';
import { NestedRepoPicker } from '@/components/views/git/NestedRepoPicker';
import { getRemotes } from '@/lib/gitApi';
import { useI18n } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useGitStore } from '@/stores/useGitStore';
import { useUIStore } from '@/stores/useUIStore';
import type { GiteaItem, GiteaItemDetail, GiteaRepository } from '@/lib/api/types';
import { GiteaItemDetailView } from './gitea-item-detail';

export interface GiteaSelection {
  providerId: string;
  id: string;
  title: string;
  url: string;
  contextText: string;
  thread: 'issue' | 'pull';
  author?: string;
  instanceUrl: string;
  owner: string;
  repo: string;
}

interface GiteaContextPayload {
  repo: GiteaRepository;
  item: GiteaItem;
  pull: GiteaItemDetail['pull'];
  comments: GiteaItemDetail['comments'];
  commentsTruncated: boolean;
  diff?: string;
  diffTruncated?: boolean;
}

function contextText(detail: GiteaItemDetail, diff: string | null): string {
  const context: GiteaContextPayload = {
    repo: detail.repo,
    item: detail.item,
    pull: detail.pull,
    comments: detail.comments,
    commentsTruncated: detail.commentsTruncated,
  };
  if (diff !== null) {
    context.diff = diff.slice(0, 100_000);
    context.diffTruncated = diff.length > 100_000;
  }
  const json = JSON.stringify(context, null, 2);
  const maxLength = 200_000;
  return `Gitea ${detail.item.kind === 'pr' ? 'pull request' : 'issue'} context (JSON)\n${json.length > maxLength
    ? `${json.slice(0, maxLength)}\n[Gitea context truncated]` : json}`;
}

const sameRepository = (left: GiteaRepository, right: GiteaRepository): boolean =>
  left.instanceUrl === right.instanceUrl && left.owner === right.owner &&
  left.name === right.name && left.remote === right.remote;

const repositoryLabel = (repo: GiteaRepository): string =>
  `${repo.instanceUrl}/${repo.owner}/${repo.name} (${repo.remote})`;

export function GiteaPickerDialog({ open, onOpenChange, onSelect }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (selection: GiteaSelection) => void;
}) {
  const { t } = useI18n();
  const { gitea } = useRuntimeAPIs();
  const runtimeKey = getRuntimeKey();
  const rootDirectory = useEffectiveDirectory() ?? '';
  const { rootIsGitRepo, gitDirectory, nestedRepos } = useNestedGitDirectory(rootDirectory || null, { enabled: open });
  const selectNestedRepo = useGitStore((state) => state.selectNestedRepo);
  const ensureNestedRepos = useGitStore((state) => state.ensureNestedRepos);
  const isMobile = useUIStore((state) => state.isMobile);
  const directory = gitDirectory && (rootIsGitRepo === true || gitDirectory !== rootDirectory) ? gitDirectory : '';
  const [kind, setKind] = React.useState<GiteaItem['kind']>('issue');
  const [items, setItems] = React.useState<GiteaItem[]>([]);
  const [resultScope, setResultScope] = React.useState('');
  const [discovery, setDiscovery] = React.useState<{
    runtimeKey: string; directory: string; repositories: GiteaRepository[]; error: string | null;
  } | null>(null);
  const [selectedRemote, setSelectedRemote] = React.useState('');
  const currentDiscovery = discovery?.runtimeKey === runtimeKey && discovery.directory === directory ? discovery : null;
  const repositories = currentDiscovery?.repositories ?? [];
  const repo = repositories.find((candidate) => candidate.remote === selectedRemote) ?? repositories[0] ?? null;
  const [searchText, setSearchText] = React.useState('');
  const listScope = JSON.stringify([runtimeKey, directory, repo?.instanceUrl, repo?.owner, repo?.name,
    repo?.remote, kind, searchText.trim()]);
  const visibleItems = resultScope === listScope ? items : [];
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(false);
  const [numberText, setNumberText] = React.useState('');
  const [includeDiff, setIncludeDiff] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [selecting, setSelecting] = React.useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = React.useState<GiteaItemDetail | null>(null);
  const [selectedDetailScope, setSelectedDetailScope] = React.useState('');
  const currentSelectedDetail = selectedDetailScope === listScope ? selectedDetail : null;
  const [attaching, setAttaching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestId = React.useRef(0);

  React.useEffect(() => {
    if (!open || !gitea || !directory) {
      setDiscovery(null);
      return;
    }
    let active = true;
    setDiscovery(null);
    void getRemotes(directory).then(async (remotes) => {
      const results = await Promise.allSettled(remotes.map((remote) => gitea.repository(directory, remote.name)));
      if (!active) return;
      const repositories = results.flatMap((result) => result.status === 'fulfilled' && result.value
        ? [result.value] : []);
      repositories.sort((a, b) => Number(b.remote === 'origin') - Number(a.remote === 'origin'));
      const failure = results.find((result) => result.status === 'rejected');
      setDiscovery({ runtimeKey, directory, repositories,
        error: failure?.status === 'rejected' ? String(failure.reason instanceof Error
          ? failure.reason.message : failure.reason) : null });
      setSelectedRemote((current) => repositories.some((candidate) => candidate.remote === current)
        ? current : repositories[0]?.remote ?? '');
    }).catch((caught) => {
      if (active) setDiscovery({ runtimeKey, directory, repositories: [],
        error: caught instanceof Error ? caught.message : String(caught) });
    });
    return () => { active = false; };
  }, [directory, gitea, open, runtimeKey]);

  React.useEffect(() => {
    if (!open || !gitea || !directory || !repo) {
      requestId.current++;
      setItems([]);
      setResultScope('');
      setHasMore(false);
      setLoading(false);
      setError(null);
      setSelectedDetail(null);
      setSelectedDetailScope('');
      return;
    }
    const current = ++requestId.current;
    let active = true;
    setLoading(true);
    setLoadingMore(false);
    setSelecting(null);
    setSelectedDetail(null);
    setSelectedDetailScope('');
    setError(null);
    setItems([]);
    setResultScope('');
    setHasMore(false);
    const timer = window.setTimeout(() => {
      void gitea.items(directory, kind, { remote: repo.remote, query: searchText.trim() }).then((result) => {
        if (!active || current !== requestId.current) return;
        if (!sameRepository(result.repo, repo)) throw new Error('The Gitea repository changed. Reopen the picker.');
        setItems(result.items);
        setResultScope(listScope);
        setPage(result.page);
        setHasMore(result.hasMore);
      }).catch((caught: Error) => {
        if (active && current === requestId.current) setError(caught instanceof Error && caught.message
          ? caught.message : t('session.giteaPicker.loadFailed'));
      }).finally(() => {
        if (active && current === requestId.current) setLoading(false);
      });
    }, searchText.trim() ? 300 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, gitea, directory, repo, kind, searchText, listScope, t]);

  const loadMore = async () => {
    if (!gitea || !repo || loadingMore || !hasMore || resultScope !== listScope) return;
    const current = requestId.current;
    setLoadingMore(true);
    try {
      const result = await gitea.items(directory, kind,
        { page: page + 1, remote: repo.remote, query: searchText.trim() });
      if (current !== requestId.current) return;
      if (!sameRepository(result.repo, repo)) throw new Error('The Gitea repository changed. Reopen the picker.');
      setItems((current) => [...current, ...result.items]);
      setPage(result.page);
      setHasMore(result.hasMore);
    } catch (error) {
      if (current === requestId.current) setError(error instanceof Error && error.message
        ? error.message : t('session.giteaPicker.loadFailed'));
    } finally {
      if (current === requestId.current) setLoadingMore(false);
    }
  };

  const select = async (number: number) => {
    if (!gitea || !directory || !repo || selecting !== null) return;
    const current = requestId.current;
    setSelecting(number);
    setError(null);
    try {
      const detail = await gitea.item(directory, kind, number, repo.remote);
      if (current !== requestId.current) return;
      if (!sameRepository(detail.repo, repo)) throw new Error('The Gitea repository changed. Reopen the picker.');
      setSelectedDetail(detail);
      setSelectedDetailScope(listScope);
    } catch (error) {
      if (current === requestId.current) setError(error instanceof Error && error.message
        ? error.message : t('session.giteaPicker.detailFailed'));
    } finally {
      if (current === requestId.current) setSelecting(null);
    }
  };

  const postComment = async (body: string) => {
    if (!gitea || !currentSelectedDetail) return;
    const current = requestId.current;
    const { repo: selectedRepo, item } = currentSelectedDetail;
    const posted = await gitea.comment({ directory, remote: selectedRepo.remote, kind: item.kind,
      number: item.number, body, instanceUrl: selectedRepo.instanceUrl,
      owner: selectedRepo.owner, repo: selectedRepo.name });
    if (current === requestId.current) setSelectedDetail((previous) => previous?.item.number === item.number &&
      previous.repo.instanceUrl === selectedRepo.instanceUrl && previous.repo.owner === selectedRepo.owner &&
      previous.repo.name === selectedRepo.name ? { ...previous, comments: [...previous.comments, posted] } : previous);
  };

  const attach = async () => {
    if (!gitea || !currentSelectedDetail || attaching) return;
    const current = requestId.current;
    setAttaching(true);
    setError(null);
    try {
      const { repo: selectedRepo, item } = currentSelectedDetail;
      const diff = item.kind === 'pr' && includeDiff
        ? await gitea.pullDiff(directory, item.number, selectedRepo.remote, selectedRepo) : null;
      if (current !== requestId.current) return;
      const selection: GiteaSelection = {
        providerId: `gitea:${encodeURIComponent(selectedRepo.instanceUrl)}/${encodeURIComponent(selectedRepo.owner)}/${encodeURIComponent(selectedRepo.name)}`,
        id: String(item.number), title: item.title, url: item.url,
        contextText: contextText(currentSelectedDetail, diff), thread: item.kind === 'pr' ? 'pull' : 'issue',
        instanceUrl: selectedRepo.instanceUrl, owner: selectedRepo.owner, repo: selectedRepo.name,
      };
      if (item.author) selection.author = item.author;
      onSelect(selection);
      onOpenChange(false);
    } catch (error) {
      if (current === requestId.current) setError(error instanceof Error && error.message
        ? error.message : t('session.giteaPicker.detailFailed'));
    } finally {
      if (current === requestId.current) setAttaching(false);
    }
  };

  const directNumber = Number(numberText.trim().replace(/^#/, ''));
  const validNumber = Number.isInteger(directNumber) && directNumber > 0;
  const title = t('session.giteaPicker.title');
  const description = t('session.giteaPicker.description');
  const content = (
    <div className="min-h-0 space-y-4 overflow-y-auto py-2">
      {currentSelectedDetail ? <>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setSelectedDetail(null); setError(null); }}>
          {t('session.giteaDetail.back')}
        </Button>
        <GiteaItemDetailView key={`${directory}:${currentSelectedDetail.repo.instanceUrl}:${currentSelectedDetail.repo.owner}:${currentSelectedDetail.repo.name}:${currentSelectedDetail.item.kind}:${currentSelectedDetail.item.number}`}
          detail={currentSelectedDetail} onComment={postComment} />
        {currentSelectedDetail.item.kind === 'pr' ? <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={includeDiff} onChange={setIncludeDiff}
            ariaLabel={t('session.giteaPicker.includeDiff')} />
          <button type="button" onClick={() => setIncludeDiff((value) => !value)}>
            {t('session.giteaPicker.includeDiff')}
          </button>
        </div> : null}
        {error ? <p role="alert" className="text-sm text-[var(--status-error-text)]">{error}</p> : null}
        <Button type="button" size="sm" disabled={attaching} onClick={() => { void attach(); }}>
          {attaching ? t('common.loading') : t('session.giteaDetail.attach')}
        </Button>
      </> : <>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={kind === 'issue' ? 'secondary' : 'ghost'}
          onClick={() => { setKind('issue'); setNumberText(''); }}>
          {t('session.giteaPicker.issues')}
        </Button>
        <Button type="button" size="sm" variant={kind === 'pr' ? 'secondary' : 'ghost'}
          onClick={() => { setKind('pr'); setNumberText(''); }}>
          {t('session.giteaPicker.pullRequests')}
        </Button>
      </div>
      {rootIsGitRepo === false && Array.isArray(nestedRepos) && nestedRepos.length > 0 ? (
        <NestedRepoPicker repositories={nestedRepos} selectedRepository={gitDirectory}
          repositoryRoot={rootDirectory}
          onSelectRepository={(repository) => selectNestedRepo(rootDirectory, repository)} />
      ) : null}
      {repositories.length > 1 && repo ? (
        <Select value={repo.remote} onValueChange={setSelectedRemote}>
          <SelectTrigger size="sm" aria-label={t('gitView.empty.selectRepositoryPlaceholder')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{repositories.map((candidate) => (
            <SelectItem key={`${candidate.instanceUrl}:${candidate.owner}/${candidate.name}:${candidate.remote}`}
              value={candidate.remote}>{repositoryLabel(candidate)}</SelectItem>
          ))}</SelectContent>
        </Select>
      ) : repo ? <p className="break-all text-xs text-muted-foreground">{repositoryLabel(repo)}</p> : null}
      {currentDiscovery?.error ? (
        <p role="alert" className="text-sm text-[var(--status-error-text)]">{currentDiscovery.error}</p>
      ) : null}
      {directory && !currentDiscovery ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}
      {directory && currentDiscovery && repositories.length === 0 && !currentDiscovery.error ? (
        <p className="text-sm text-muted-foreground">{t('session.giteaPicker.noConnectedRepository')}</p>
      ) : null}
      {repo ? <Input type="search" value={searchText} maxLength={256}
        onChange={(event) => setSearchText(event.target.value)}
        placeholder={t('session.giteaPicker.searchPlaceholder')}
        aria-label={t('session.giteaPicker.searchPlaceholder')} /> : null}
      <div className="flex gap-2">
        <Input type="text" inputMode="numeric" value={numberText}
          onChange={(event) => setNumberText(event.target.value)}
          placeholder={t('session.giteaPicker.numberPlaceholder')} aria-label={t('session.giteaPicker.numberPlaceholder')}
          className="max-w-40" />
        <Button type="button" size="sm" variant="outline" disabled={!repo || !validNumber || selecting !== null}
          onClick={() => void select(directNumber)}>{t('session.giteaPicker.useNumber')}</Button>
      </div>
      {kind === 'pr' ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={includeDiff} onChange={setIncludeDiff}
            ariaLabel={t('session.giteaPicker.includeDiff')} />
          <button type="button" onClick={() => setIncludeDiff((value) => !value)}>
            {t('session.giteaPicker.includeDiff')}
          </button>
        </div>
      ) : null}
      {!rootDirectory ? <p className="text-sm text-muted-foreground">{t('session.giteaPicker.noProject')}</p> : null}
      {rootDirectory && !directory ? <p className="text-sm text-muted-foreground">
        {rootIsGitRepo === false && nestedRepos === null ? t('gitView.empty.discoverFailed')
          : rootIsGitRepo === false && (nestedRepos === 'unsupported' || (Array.isArray(nestedRepos) && nestedRepos.length === 0))
            ? t('gitView.empty.notGitRepository') : t('gitView.empty.discoveringRepositories')}
      </p> : null}
      {rootDirectory && !directory && nestedRepos === null ? (
        <Button type="button" size="sm" variant="outline"
          onClick={() => void ensureNestedRepos(rootDirectory, { force: true })}>
          {t('gitView.empty.retryDiscovery')}
        </Button>
      ) : null}
      {error ? <p role="alert" className="text-sm text-[var(--status-error-text)]">{error}</p> : null}
      {repo && (loading || (!error && resultScope !== listScope)) ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : null}
      {!loading && !error && visibleItems.length === 0 && repo && resultScope === listScope ? (
        <p className="text-sm text-muted-foreground">{t(searchText.trim()
          ? 'session.giteaPicker.noSearchResults' : 'session.giteaPicker.empty')}</p>
      ) : null}
      <div className="space-y-1">
        {visibleItems.map((item) => (
          <button type="button" key={`${repo?.instanceUrl}:${repo?.owner}/${repo?.name}:${kind}:${item.number}`} disabled={selecting !== null}
            onClick={() => void select(item.number)}
            className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left hover:bg-[var(--interactive-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]">
            <span className="shrink-0 text-sm text-muted-foreground">#{item.number}</span>
            <span className="min-w-0 break-words text-sm text-foreground">{item.title}
              {repo ? <span className="block break-all text-xs text-muted-foreground">{repositoryLabel(repo)}</span> : null}
            </span>
          </button>
        ))}
      </div>
      {hasMore && resultScope === listScope ? <Button type="button" size="sm" variant="outline" disabled={loadingMore}
        onClick={() => void loadMore()}>{t('session.giteaPicker.loadMore')}</Button> : null}
      </>}
    </div>
  );

  if (isMobile) {
    return <MobileOverlayPanel open={open} title={title} onClose={() => onOpenChange(false)}>{content}</MobileOverlayPanel>;
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[70vh] max-w-xl flex-col">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
