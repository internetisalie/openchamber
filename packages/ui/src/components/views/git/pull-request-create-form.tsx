import React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Icon } from '@/components/icon/Icon';
import { useDeviceInfo } from '@/lib/device';
import { useI18n } from '@/lib/i18n';

interface PullRequestCreateFormProps {
  branch: string;
  base: string;
  baseBranches: string[];
  title: string;
  body: string;
  draft: boolean;
  additionalContext: string;
  repoUrl: string | null;
  targetLabel: string;
  isCreating: boolean;
  isGenerating: boolean;
  canCreate: boolean;
  onBaseChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onDraftChange: (value: boolean) => void;
  onAdditionalContextChange: (value: string) => void;
  onGenerate: () => void;
  onCreate: () => void;
}

export function PullRequestCreateForm({
  branch, base, baseBranches, title, body, draft, additionalContext, repoUrl, targetLabel,
  isCreating, isGenerating, canCreate, onBaseChange, onTitleChange, onBodyChange,
  onDraftChange, onAdditionalContextChange, onGenerate, onCreate,
}: PullRequestCreateFormProps) {
  const { t } = useI18n();
  const { isMobile, hasTouchInput } = useDeviceInfo();
  const [isContextOpen, setIsContextOpen] = React.useState(false);
  const [isContextSheetOpen, setIsContextSheetOpen] = React.useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="typography-ui-label text-foreground">{t('gitView.pr.createTitle')}</div>
          <div className="typography-micro text-muted-foreground truncate">
            {branch} <span className="opacity-60">(local)</span> → {base} <span className="opacity-60">({targetLabel})</span>
          </div>
        </div>
        {repoUrl ? (
          <Button variant="outline" size="sm" asChild>
            <a href={repoUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="external-link" className="size-4" />
              {t('gitView.pr.actions.repo')}
            </a>
          </Button>
        ) : null}
      </div>

      <label className="space-y-1">
        <div className="typography-micro text-muted-foreground">{t('gitView.pr.field.title')}</div>
        <Input value={title} onChange={(event) => onTitleChange(event.target.value)}
          placeholder={t('gitView.pr.placeholder.title')} autoCorrect={hasTouchInput ? 'on' : 'off'}
          autoCapitalize={hasTouchInput ? 'sentences' : 'off'} spellCheck={hasTouchInput} />
      </label>

      <label className="space-y-1">
        <div className="typography-micro text-muted-foreground">{t('gitView.pr.field.baseBranch')}</div>
        {baseBranches.length > 0 ? (
          <Select value={base} onValueChange={onBaseChange}>
            <SelectTrigger size="lg"><SelectValue placeholder={t('gitView.pr.placeholder.selectBaseBranch')} /></SelectTrigger>
            <SelectContent>
              {baseBranches.map((candidate) => <SelectItem key={candidate} value={candidate}>{candidate}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Input value={base} onChange={(event) => onBaseChange(event.target.value)}
            placeholder={t('gitView.pr.placeholder.main')} />
        )}
      </label>

      <label className="space-y-1">
        <div className="typography-micro text-muted-foreground">{t('gitView.pr.field.description')}</div>
        <Textarea value={body} onChange={(event) => onBodyChange(event.target.value)}
          className="min-h-[110px]" placeholder={t('gitView.pr.placeholder.whatChanged')}
          autoCorrect={hasTouchInput ? 'on' : 'off'}
          autoCapitalize={hasTouchInput ? 'sentences' : 'off'} spellCheck={hasTouchInput} />
      </label>

      <div className="flex items-center gap-2 cursor-pointer" role="button" tabIndex={0}
        aria-pressed={draft} onClick={() => onDraftChange(!draft)}
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            onDraftChange(!draft);
          }
        }}>
        <Checkbox size="sm" checked={draft} onChange={onDraftChange}
          ariaLabel={t('gitView.pr.actions.toggleDraftAria')} />
        <span className="typography-ui-label text-foreground select-none">{t('gitView.pr.field.draft')}</span>
      </div>

      {isMobile ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="typography-micro text-muted-foreground">{t('gitView.pr.additionalContext.optional')}</span>
            <Button variant="outline" size="sm" onClick={() => setIsContextSheetOpen(true)}>
              {additionalContext.trim() ? t('gitView.pr.actions.edit') : t('gitView.pr.actions.add')}
            </Button>
          </div>
          {additionalContext.trim() ? (
            <span className="inline-flex items-center rounded-full bg-[var(--interactive-selection)] px-2 py-0.5 text-xs text-[var(--interactive-selection-foreground)]">
              {t('gitView.pr.additionalContext.added')}
            </span>
          ) : null}
        </div>
      ) : (
        <Collapsible open={isContextOpen} onOpenChange={setIsContextOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)] px-3 py-2 hover:bg-[var(--interactive-hover)]">
            <span className="typography-micro text-muted-foreground">{t('gitView.pr.additionalContext.optional')}</span>
            <span className="typography-micro text-[var(--primary-base)]">
              {isContextOpen ? t('gitView.pr.actions.hide') : additionalContext.trim() ? t('gitView.pr.actions.edit') : t('gitView.pr.actions.add')}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-2 rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)] p-3">
              <Textarea value={additionalContext} onChange={(event) => onAdditionalContextChange(event.target.value)}
                className="min-h-[100px] bg-transparent" placeholder={t('gitView.pr.placeholder.additionalContext')} />
              <p className="typography-micro text-muted-foreground">{t('gitView.pr.additionalContext.hint')}</p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      <MobileOverlayPanel open={isContextSheetOpen} onClose={() => setIsContextSheetOpen(false)}
        title={t('gitView.pr.additionalContext.title')}
        footer={<Button size="sm" onClick={() => setIsContextSheetOpen(false)} className="w-full">{t('gitView.common.done')}</Button>}>
        <div className="space-y-3">
          <Textarea value={additionalContext} onChange={(event) => onAdditionalContextChange(event.target.value)}
            className="min-h-[200px] bg-transparent" placeholder={t('gitView.pr.placeholder.additionalContext')} autoFocus />
          <p className="typography-micro text-muted-foreground">{t('gitView.pr.additionalContext.hint')}</p>
        </div>
      </MobileOverlayPanel>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onGenerate} disabled={isGenerating || isCreating}>
          {isGenerating ? <Icon name="loader-4" className="size-4 animate-spin" /> : <Icon name="ai-generate-2" className="size-4 text-primary" />}
          {t('gitView.commit.generate')}
        </Button>
        <div className="flex-1" />
        <Button size="sm" className="min-w-[7.5rem] justify-center gap-2" onClick={onCreate}
          disabled={isCreating || !canCreate || !base.trim()}>
          <span className="inline-flex size-4 items-center justify-center">
            {isCreating ? <Icon name="loader-4" className="size-4 animate-spin" /> : <Icon name="git-pull-request" className="size-4" />}
          </span>
          <span>{t('gitView.pr.actions.createPr')}</span>
        </Button>
      </div>
    </>
  );
}
