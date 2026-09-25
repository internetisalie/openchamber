import React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useI18n } from '@/lib/i18n';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
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

function contextText(detail: GiteaItemDetail, diff: string | null): string {
  const json = JSON.stringify({
    repo: detail.repo,
    item: detail.item,
    comments: detail.comments,
    commentsTruncated: detail.commentsTruncated,
    ...(diff === null ? {} : { diff: diff.slice(0, 100_000), diffTruncated: diff.length > 100_000 }),
  }, null, 2);
  const maxLength = 200_000;
  return `Gitea ${detail.item.kind === 'pr' ? 'pull request' : 'issue'} context (JSON)\n${json.length > maxLength
    ? `${json.slice(0, maxLength)}\n[Gitea context truncated]` : json}`;
}

export function GiteaPickerDialog({ open, onOpenChange, onSelect }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (selection: GiteaSelection) => void;
}) {
  const { t } = useI18n();
  const { gitea } = useRuntimeAPIs();
  const project = useProjectsStore((state) => state.getActiveProject());
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const isMobile = useUIStore((state) => state.isMobile);
  const directory = project?.path || currentDirectory || '';
  const [kind, setKind] = React.useState<GiteaItem['kind']>('issue');
  const [items, setItems] = React.useState<GiteaItem[]>([]);
  const [repo, setRepo] = React.useState<GiteaRepository | null>(null);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(false);
  const [numberText, setNumberText] = React.useState('');
  const [includeDiff, setIncludeDiff] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [selecting, setSelecting] = React.useState<number | null>(null);
  const [selectedDetail, setSelectedDetail] = React.useState<GiteaItemDetail | null>(null);
  const [attaching, setAttaching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestId = React.useRef(0);

  React.useEffect(() => {
    if (!open || !gitea || !directory) {
      requestId.current++;
      setItems([]);
      setRepo(null);
      setHasMore(false);
      setLoading(false);
      setError(null);
      setSelectedDetail(null);
      return;
    }
    const current = ++requestId.current;
    let active = true;
    setLoading(true);
    setLoadingMore(false);
    setSelecting(null);
    setSelectedDetail(null);
    setError(null);
    setItems([]);
    setRepo(null);
    setHasMore(false);
    void gitea.items(directory, kind).then((result) => {
      if (!active || current !== requestId.current) return;
      setItems(result.items);
      setRepo(result.repo);
      setPage(result.page);
      setHasMore(result.hasMore);
    }).catch((error: unknown) => {
      if (active && current === requestId.current) setError(error instanceof Error && error.message
        ? error.message : t('session.giteaPicker.loadFailed'));
    }).finally(() => {
      if (active && current === requestId.current) setLoading(false);
    });
    return () => { active = false; };
  }, [open, gitea, directory, kind, t]);

  const loadMore = async () => {
    if (!gitea || loadingMore || !hasMore) return;
    const current = requestId.current;
    setLoadingMore(true);
    try {
      const result = await gitea.items(directory, kind, page + 1);
      if (current !== requestId.current) return;
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
    if (!gitea || !directory || selecting !== null) return;
    const current = requestId.current;
    setSelecting(number);
    setError(null);
    try {
      const detail = await gitea.item(directory, kind, number);
      if (current !== requestId.current) return;
      setSelectedDetail(detail);
    } catch (error) {
      if (current === requestId.current) setError(error instanceof Error && error.message
        ? error.message : t('session.giteaPicker.detailFailed'));
    } finally {
      if (current === requestId.current) setSelecting(null);
    }
  };

  const postComment = async (body: string) => {
    if (!gitea || !selectedDetail) return;
    const current = requestId.current;
    const { repo: selectedRepo, item } = selectedDetail;
    const posted = await gitea.comment({ directory, remote: selectedRepo.remote, kind: item.kind,
      number: item.number, body, instanceUrl: selectedRepo.instanceUrl,
      owner: selectedRepo.owner, repo: selectedRepo.name });
    if (current === requestId.current) setSelectedDetail((previous) => previous?.item.number === item.number &&
      previous.repo.instanceUrl === selectedRepo.instanceUrl && previous.repo.owner === selectedRepo.owner &&
      previous.repo.name === selectedRepo.name ? { ...previous, comments: [...previous.comments, posted] } : previous);
  };

  const attach = async () => {
    if (!gitea || !selectedDetail || attaching) return;
    const current = requestId.current;
    setAttaching(true);
    setError(null);
    try {
      const { repo: selectedRepo, item } = selectedDetail;
      const diff = item.kind === 'pr' && includeDiff
        ? await gitea.pullDiff(directory, item.number, selectedRepo.remote) : null;
      if (current !== requestId.current) return;
      onSelect({
        providerId: `gitea:${encodeURIComponent(selectedRepo.instanceUrl)}/${encodeURIComponent(selectedRepo.owner)}/${encodeURIComponent(selectedRepo.name)}`,
        id: String(item.number), title: item.title, url: item.url,
        contextText: contextText(selectedDetail, diff), thread: item.kind === 'pr' ? 'pull' : 'issue',
        instanceUrl: selectedRepo.instanceUrl, owner: selectedRepo.owner, repo: selectedRepo.name,
        ...(item.author ? { author: item.author } : {}),
      });
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
      {selectedDetail ? <>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setSelectedDetail(null); setError(null); }}>
          {t('session.giteaDetail.back')}
        </Button>
        <GiteaItemDetailView key={`${directory}:${selectedDetail.repo.instanceUrl}:${selectedDetail.repo.owner}:${selectedDetail.repo.name}:${selectedDetail.item.kind}:${selectedDetail.item.number}`}
          detail={selectedDetail} onComment={postComment} />
        {selectedDetail.item.kind === 'pr' ? <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
      {repo ? <p className="break-all text-xs text-muted-foreground">
        {repo.instanceUrl}/{repo.owner}/{repo.name}
      </p> : null}
      <div className="flex gap-2">
        <Input type="text" inputMode="numeric" value={numberText}
          onChange={(event) => setNumberText(event.target.value)}
          placeholder={t('session.giteaPicker.numberPlaceholder')} aria-label={t('session.giteaPicker.numberPlaceholder')}
          className="max-w-40" />
        <Button type="button" size="sm" variant="outline" disabled={!directory || !validNumber || selecting !== null}
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
      {!directory ? <p className="text-sm text-muted-foreground">{t('session.giteaPicker.noProject')}</p> : null}
      {error ? <p role="alert" className="text-sm text-[var(--status-error-text)]">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}
      {!loading && !error && items.length === 0 && directory ? (
        <p className="text-sm text-muted-foreground">{t('session.giteaPicker.empty')}</p>
      ) : null}
      <div className="space-y-1">
        {items.map((item) => (
          <button type="button" key={`${kind}:${item.number}`} disabled={selecting !== null}
            onClick={() => void select(item.number)}
            className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left hover:bg-[var(--interactive-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]">
            <span className="shrink-0 text-sm text-muted-foreground">#{item.number}</span>
            <span className="min-w-0 break-words text-sm text-foreground">{item.title}</span>
          </button>
        ))}
      </div>
      {hasMore ? <Button type="button" size="sm" variant="outline" disabled={loadingMore}
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
