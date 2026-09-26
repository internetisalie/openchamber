import React from 'react';
import { toast } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Icon } from '@/components/icon/Icon';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { generatePullRequestDescription } from '@/lib/gitApi';
import { useI18n } from '@/lib/i18n';
import type { GiteaItemDetail, GiteaRepository, GitRemote } from '@/lib/api/types';
import { GiteaItemDetailView } from '@/components/session/gitea-item-detail';
import { createGiteaPrIdentity, getGiteaPrIdentityKey, useGiteaPrStatusStore } from '@/stores/useGiteaPrStatusStore';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { subscribeGitStatusInvalidations } from '@/lib/gitStatusInvalidation';
import { PullRequestCreateForm } from './pull-request-create-form';

interface GiteaPullRequestSectionProps {
  directory: string;
  branch: string;
  baseBranch: string;
  trackingBranch?: string;
  remotes: GitRemote[];
  remoteBranches: string[];
  repository: GiteaRepository;
}

const branchTitle = (branch: string) => branch.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export function GiteaPullRequestSection({
  directory, branch, baseBranch, trackingBranch, remotes, remoteBranches, repository,
}: GiteaPullRequestSectionProps) {
  const { t } = useI18n();
  const { gitea } = useRuntimeAPIs();
  const [repositories, setRepositories] = React.useState<GiteaRepository[]>([repository]);
  const [selectedRemote, setSelectedRemote] = React.useState(repository.remote);
  const [title, setTitle] = React.useState(() => branchTitle(branch));
  const [base, setBase] = React.useState(baseBranch);
  const [body, setBody] = React.useState('');
  const [draft, setDraft] = React.useState(false);
  const [additionalContext, setAdditionalContext] = React.useState('');
  const [detail, setDetail] = React.useState<{ identity: string; number: number; value: GiteaItemDetail } | null>(null);
  const [detailError, setDetailError] = React.useState<{ identity: string; number: number; message: string } | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [refreshRevision, setRefreshRevision] = React.useState(0);

  React.useEffect(() => {
    if (!gitea) return;
    let cancelled = false;
    void Promise.allSettled(remotes.map((remote) => gitea.repository(directory, remote.name)))
      .then((results) => {
        if (cancelled) return;
        const matches = results.flatMap((result) => result.status === 'fulfilled' && result.value &&
          result.value.instanceUrl === repository.instanceUrl ? [result.value] : []);
        setRepositories(matches.length ? matches : [repository]);
      });
    return () => { cancelled = true; };
  }, [directory, gitea, remotes, repository]);

  const target = repositories.find((candidate) => candidate.remote === selectedRemote) ?? repository;
  const trackingRemote = trackingBranch?.split('/')[0];
  const sourceRemote = trackingRemote && repositories.some((candidate) => candidate.remote === trackingRemote)
    ? trackingRemote : selectedRemote !== 'origin' && repositories.some((candidate) => candidate.remote === 'origin')
      ? 'origin' : selectedRemote;
  const source = repositories.find((candidate) => candidate.remote === sourceRemote);
  const sameRepository = source?.owner === target.owner && source.name === target.name;
  const baseBranches = React.useMemo(() => {
    const options = remoteBranches.filter((candidate) => candidate.startsWith(`${selectedRemote}/`))
      .map((candidate) => candidate.slice(selectedRemote.length + 1));
    return Array.from(new Set([...options, base].filter(Boolean))).sort();
  }, [base, remoteBranches, selectedRemote]);
  const repoUrl = `${target.instanceUrl}/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.name)}`;
  const runtimeKey = getRuntimeKey();
  const prIdentity = React.useMemo(() => ({ ...createGiteaPrIdentity(directory, branch, target, sourceRemote), runtimeKey }),
    [runtimeKey, directory, branch, target, sourceRemote]);
  const identity = getGiteaPrIdentityKey(prIdentity);
  const statusEntry = useGiteaPrStatusStore((state) => state.entries[identity]);
  const refreshExact = useGiteaPrStatusStore((state) => state.refreshExact);
  const publishStatus = useGiteaPrStatusStore((state) => state.publish);
  const item = statusEntry?.status?.item ?? null;
  const itemNumber = item?.number;
  const currentDetail = detail?.identity === identity && detail.number === item?.number ? detail.value : null;

  React.useEffect(() => {
    let timer: number | null = null;
    const unsubscribe = subscribeGitStatusInvalidations((changedDirectory) => {
      if (changedDirectory !== directory) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => { timer = null; setRefreshRevision((value) => value + 1); }, 1_500);
    });
    return () => { unsubscribe(); if (timer !== null) window.clearTimeout(timer); };
  }, [directory]);

  React.useEffect(() => {
    if (!gitea) return;
    let cancelled = false;
    setIsLoading(true);
    void refreshExact(gitea, prIdentity)
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [gitea, identity, prIdentity, refreshExact, refreshRevision]);

  React.useEffect(() => {
    if (!gitea || !itemNumber) return;
    let cancelled = false;
    setIsLoadingDetail(true);
    void gitea.item(directory, 'pr', itemNumber, target.remote)
      .then((value) => {
        if (cancelled) return;
        if (value.repo.instanceUrl !== target.instanceUrl || value.repo.owner !== target.owner ||
            value.repo.name !== target.name || value.repo.remote !== target.remote) {
          throw new Error('The Gitea repository changed. Refresh this pull request.');
        }
        setDetail({ identity, number: itemNumber, value });
        setDetailError(null);
      })
      .catch((error: Error) => { if (!cancelled) setDetailError({ identity, number: itemNumber, message: error.message }); })
      .finally(() => { if (!cancelled) setIsLoadingDetail(false); });
    return () => { cancelled = true; };
  }, [directory, gitea, identity, itemNumber, refreshRevision,
    target.instanceUrl, target.owner, target.name, target.remote]);

  const postComment = async (commentBody: string) => {
    if (!gitea || !item || !currentDetail) return;
    const posted = await gitea.comment({ directory, remote: currentDetail.repo.remote,
      kind: 'pr', number: item.number, body: commentBody, instanceUrl: currentDetail.repo.instanceUrl,
      owner: currentDetail.repo.owner, repo: currentDetail.repo.name });
    setDetail((previous) => previous?.identity === identity && previous.number === item.number ? {
      ...previous, value: { ...previous.value, comments: [...previous.value.comments, posted] },
    } : previous);
  };

  const generateDescription = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const remoteBase = remoteBranches.includes(`${target.remote}/${base}`)
        ? `refs/remotes/${target.remote}/${base}` : base;
      const context = additionalContext.trim();
      const generated = await generatePullRequestDescription(directory,
        context ? { base: remoteBase, head: branch, context } : { base: remoteBase, head: branch });
      if (generated.title?.trim()) setTitle(generated.title.trim());
      if (generated.body?.trim()) setBody(generated.body.trim());
    } catch (error) {
      toast.error(t('gitView.pr.toast.generateDescriptionFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const createPr = async () => {
    if (!gitea) return;
    if (!title.trim()) return void toast.error(t('gitView.pr.toast.titleRequired'));
    if (!base.trim()) return void toast.error(t('gitView.pr.toast.baseBranchRequired'));
    setIsCreating(true);
    try {
      const created = await gitea.pullRequestCreate({
        directory, remote: target.remote, headRemote: sourceRemote,
        title: title.trim(), body, head: branch, base: base.trim(), draft,
      });
      publishStatus(prIdentity, { repo: target, item: created,
        pull: { draft, merged: false }, historyIncomplete: false });
      setRefreshRevision((value) => value + 1);
      toast.success(t('gitView.pr.toast.prCreated'));
    } catch (error) {
      toast.error(t('gitView.pr.toast.createPrFailed'), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className="border-0 bg-transparent rounded-none">
      <div className="px-0 py-3 border-b border-border/40 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Icon name="git-pull-request" className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="typography-ui-header font-semibold text-foreground truncate">{t('gitView.pullRequest.title')}</h3>
            {item ? <span className="typography-meta text-muted-foreground">#{item.number}</span> : null}
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 px-0"
            disabled={isLoading} onClick={() => setRefreshRevision((value) => value + 1)}
            aria-label={t('gitView.pr.actions.refreshAria')}>
            <Icon name={isLoading ? 'loader-4' : 'refresh'}
              className={`size-4 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-3 py-3">
        {repositories.length > 1 ? (
          <Select value={selectedRemote} onValueChange={setSelectedRemote}>
            <SelectTrigger size="lg"><SelectValue /></SelectTrigger>
            <SelectContent>{repositories.map((candidate) => (
              <SelectItem key={candidate.remote} value={candidate.remote}>{candidate.remote}</SelectItem>
            ))}</SelectContent>
          </Select>
        ) : null}
        {statusEntry?.error ? <p role="alert" className="typography-micro text-status-error">{statusEntry.error}</p> : null}
        {statusEntry?.status?.historyIncomplete && !item ? <p className="typography-micro text-muted-foreground">
          {t('gitView.gitea.historyIncomplete')}</p> : null}
        {item ? (
          <div className="space-y-2">
            {detailError?.identity === identity && detailError.number === item.number ? <p role="alert" className="typography-micro text-status-error">
              {detailError.message}</p> : null}
            {currentDetail ? <GiteaItemDetailView key={`${identity}:${item.number}`} detail={currentDetail}
              onComment={postComment} /> : isLoadingDetail ? <p className="typography-micro text-muted-foreground">
                {t('common.loading')}</p> : null}
          </div>
        ) : null}
        {!isLoading && statusEntry?.status && (!item || item.state === 'closed') ? (
          <PullRequestCreateForm
            branch={branch} base={base} baseBranches={baseBranches} title={title} body={body}
            draft={draft} additionalContext={additionalContext} repoUrl={repoUrl}
            targetLabel={target.remote} isCreating={isCreating} isGenerating={isGenerating}
            canCreate={Boolean(gitea) && (sameRepository ? base.trim() !== branch : true)}
            onBaseChange={setBase} onTitleChange={setTitle} onBodyChange={setBody}
            onDraftChange={setDraft} onAdditionalContextChange={setAdditionalContext}
            onGenerate={() => { void generateDescription(); }} onCreate={() => { void createPr(); }}
          />
        ) : null}
      </div>
    </section>
  );
}
