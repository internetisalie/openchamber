import React from 'react';
import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useInlineCommentDraftStore } from '@/stores/useInlineCommentDraftStore';
import type { GiteaChecks, GiteaItemDetail, GiteaPullIdentity, GiteaReviewComments } from '@/lib/api/types';

export function GiteaItemDetailView({ detail, directory, onComment }: {
  detail: GiteaItemDetail;
  directory: string;
  onComment: (body: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const { gitea } = useRuntimeAPIs();
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const newSessionDraftOpen = useSessionUIStore((state) => Boolean(state.newSessionDraft?.open));
  const [draft, setDraft] = React.useState('');
  const [posting, setPosting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { item, pull } = detail;
  const [reviews, setReviews] = React.useState<GiteaReviewComments | null>(null);
  const [checks, setChecks] = React.useState<GiteaChecks | null>(null);
  const [reviewError, setReviewError] = React.useState<string | null>(null);
  const [checkError, setCheckError] = React.useState<string | null>(null);
  const [loadingReviews, setLoadingReviews] = React.useState(false);
  const [loadingChecks, setLoadingChecks] = React.useState(false);
  const identity: GiteaPullIdentity = React.useMemo(() => ({ directory, remote: detail.repo.remote,
    number: item.number, instanceUrl: detail.repo.instanceUrl, owner: detail.repo.owner,
    repo: detail.repo.name }), [directory, detail.repo, item.number]);
  const loadReviews = React.useCallback(async () => {
    if (!gitea || loadingReviews) return;
    setLoadingReviews(true); setReviewError(null);
    try { setReviews(await gitea.reviews(identity)); }
    catch (caught) { setReviewError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setLoadingReviews(false); }
  }, [gitea, identity, loadingReviews]);
  const loadChecks = React.useCallback(async () => {
    if (!gitea || loadingChecks) return;
    setLoadingChecks(true); setCheckError(null);
    try { setChecks(await gitea.checks(identity)); }
    catch (caught) { setCheckError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setLoadingChecks(false); }
  }, [gitea, identity, loadingChecks]);
  React.useEffect(() => {
    if (!checks || checks.totalCount === 0 || !['pending', 'running'].includes(checks.state)) return;
    const timer = window.setInterval(() => { void loadChecks(); }, 35_000);
    return () => window.clearInterval(timer);
  }, [checks, loadChecks]);
  const attachToChat = (label: string, body: string, line = 0,
    source: 'pr-comment' | 'pr-check' = 'pr-comment') => {
    const sessionKey = currentSessionId ?? (newSessionDraftOpen ? 'draft' : null);
    if (!sessionKey) { setError(t('gitView.pr.toast.noActiveSession')); return; }
    useInlineCommentDraftStore.getState().addDraft({ directory, sessionKey }, {
      source,
      fileLabel: `Gitea ${detail.repo.instanceUrl}/${detail.repo.owner}/${detail.repo.name} PR #${item.number} · ${label}`,
      startLine: line, endLine: line, code: body, language: 'markdown', text: '',
    });
  };
  const status = pull?.merged === true ? t('session.giteaDetail.merged')
    : pull?.draft === true && item.state === 'open' ? t('session.giteaDetail.draft')
      : item.state === 'open' ? t('session.giteaDetail.open') : t('session.giteaDetail.closed');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    setError(null);
    try {
      await onComment(body);
      setDraft('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('session.giteaDetail.commentFailed'));
    } finally {
      setPosting(false);
    }
  };

  return <div className="space-y-4 min-w-0">
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="typography-ui-header font-semibold break-words">{item.title}</h3>
        <span className="typography-micro text-muted-foreground">#{item.number}</span>
      </div>
      <div className="typography-micro text-muted-foreground">
        {status}{item.author ? ` · ${item.author}` : ''}
      </div>
      {pull?.sourceBranch && pull.targetBranch ? <div className="typography-micro text-muted-foreground break-all">
        {pull.sourceOwner ? `${pull.sourceOwner}:` : ''}{pull.sourceBranch} → {pull.targetBranch}
      </div> : null}
      <a href={item.url} target="_blank" rel="noopener noreferrer"
        className="typography-micro text-primary underline break-all">{t('session.giteaDetail.openInGitea')}</a>
    </div>
    <div>
      <h4 className="typography-ui-label font-medium mb-1">{t('session.giteaDetail.description')}</h4>
      {item.body.trim() ? <SimpleMarkdownRenderer content={item.body}
        className="typography-markdown-body min-w-0 text-muted-foreground break-words" enableFileReferences={false}
        fallbackContent={<div className="whitespace-pre-wrap break-words text-muted-foreground">{item.body}</div>} />
        : <p className="typography-micro text-muted-foreground">{t('session.giteaDetail.noDescription')}</p>}
    </div>
    <div className="space-y-3">
      <h4 className="typography-ui-label font-medium">{t('session.giteaDetail.comments')}</h4>
      {detail.comments.length ? detail.comments.map((comment, index) => <div key={index}
        className="rounded-md border border-border/50 p-2">
        <div className="flex justify-between gap-2">
          {comment.author ? <div className="typography-micro font-medium mb-1">{comment.author}</div> : null}
          {item.kind === 'pr' ? <Button type="button" variant="ghost" size="sm" onClick={() =>
            attachToChat(comment.author ?? t('session.giteaDetail.comments'), comment.body)}>
            {t('session.giteaDetail.attach')}</Button> : null}
        </div>
        <SimpleMarkdownRenderer content={comment.body}
          className="typography-markdown-body min-w-0 text-muted-foreground break-words" enableFileReferences={false}
          fallbackContent={<div className="whitespace-pre-wrap break-words text-muted-foreground">{comment.body}</div>} />
      </div>) : <p className="typography-micro text-muted-foreground">{t('session.giteaDetail.noComments')}</p>}
      {detail.commentsTruncated ? <p className="typography-micro text-muted-foreground">
        {t('session.giteaDetail.commentsTruncated')}</p> : null}
    </div>
    {item.kind === 'pr' ? <>
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="typography-ui-label font-medium">{t('session.giteaDetail.reviewComments')}</h4>
          <Button type="button" variant="ghost" size="sm" disabled={loadingReviews}
            onClick={() => { void loadReviews(); }}>{loadingReviews ? t('common.loading')
              : reviews || reviewError ? t('session.giteaDetail.retry') : t('session.giteaDetail.load')}</Button>
        </div>
        {reviewError ? <p role="alert" className="typography-micro text-status-error">{reviewError}</p> : null}
        {reviews ? reviews.comments.length ? reviews.comments.map((comment, index) => <div
          key={`${comment.reviewId}:${comment.id ?? index}`} className="rounded-md border border-border/50 p-2 space-y-1">
          <div className="flex justify-between gap-2 typography-micro">
            <span>{comment.author ?? t('session.giteaDetail.unknownAuthor')}{comment.path ? ` · ${comment.path}${comment.line ? `:${comment.line}` : ''}` : ''}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => attachToChat(
              `${comment.author ?? 'review'}${comment.path ? ` · ${comment.path}` : ''}`, comment.body, comment.line ?? 0)}>
              {t('session.giteaDetail.attach')}</Button>
          </div>
          <SimpleMarkdownRenderer content={comment.body} enableFileReferences={false}
            className="typography-markdown-body min-w-0 text-muted-foreground break-words" />
        </div>) : <p className="typography-micro text-muted-foreground">{t('session.giteaDetail.noReviewComments')}</p> : null}
        {reviews?.truncated ? <p className="typography-micro text-muted-foreground">{t('session.giteaDetail.reviewsTruncated')}</p> : null}
      </section>
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="typography-ui-label font-medium">{t('session.giteaDetail.checks')}</h4>
          <Button type="button" variant="ghost" size="sm" disabled={loadingChecks}
            onClick={() => { void loadChecks(); }}>{loadingChecks ? t('common.loading')
              : checks || checkError ? t('session.giteaDetail.retry') : t('session.giteaDetail.load')}</Button>
        </div>
        {checkError ? <p role="alert" className="typography-micro text-status-error">{checkError}</p> : null}
        {checks ? checks.totalCount === 0 ? <p className="typography-micro text-muted-foreground">{t('session.giteaDetail.noChecks')}</p>
          : checks.checks.map((check, index) => <div key={check.id ?? index} className="rounded-md border border-border/50 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="typography-micro font-medium">{check.name} · {check.state}</span>
              {['failure', 'error', 'failed'].includes(check.state) ? <Button type="button" variant="ghost" size="sm"
                onClick={() => attachToChat(`check ${check.name}`,
                  `${check.name}: ${check.state}${check.description ? `\n${check.description}` : ''}\n${check.url ?? ''}`,
                  0, 'pr-check')}>
                {t('session.giteaDetail.attach')}</Button> : null}
            </div>
            {check.description ? <p className="typography-micro text-muted-foreground">{check.description}</p> : null}
          </div>) : null}
      </section>
    </> : null}
    <form onSubmit={(event) => { void submit(event); }} className="space-y-2">
      <label htmlFor={`gitea-comment-${item.kind}-${item.number}`} className="typography-ui-label font-medium">
        {t('session.giteaDetail.addComment')}
      </label>
      <Textarea id={`gitea-comment-${item.kind}-${item.number}`} value={draft}
        onChange={(event) => setDraft(event.target.value)} maxLength={60_000} disabled={posting} />
      {error ? <p role="alert" className="typography-micro text-status-error">{error}</p> : null}
      <Button type="submit" size="sm" disabled={!draft.trim() || posting}>
        {posting ? t('common.loading') : t('session.giteaDetail.postComment')}
      </Button>
    </form>
  </div>;
}
