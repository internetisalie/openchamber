import React from 'react';
import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n';
import type { GiteaItemDetail } from '@/lib/api/types';

export function GiteaItemDetailView({ detail, onComment }: {
  detail: GiteaItemDetail;
  onComment: (body: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = React.useState('');
  const [posting, setPosting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { item, pull } = detail;
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
        {comment.author ? <div className="typography-micro font-medium mb-1">{comment.author}</div> : null}
        <SimpleMarkdownRenderer content={comment.body}
          className="typography-markdown-body min-w-0 text-muted-foreground break-words" enableFileReferences={false}
          fallbackContent={<div className="whitespace-pre-wrap break-words text-muted-foreground">{comment.body}</div>} />
      </div>) : <p className="typography-micro text-muted-foreground">{t('session.giteaDetail.noComments')}</p>}
      {detail.commentsTruncated ? <p className="typography-micro text-muted-foreground">
        {t('session.giteaDetail.commentsTruncated')}</p> : null}
    </div>
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
