import React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import type { UpdateInfo } from '@/lib/desktop';
import { openExternalUrl } from '@/lib/url';
import { useI18n } from '@/lib/i18n';

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: UpdateInfo | null;
  error: string | null;
}

const FORK_RELEASES_URL = 'https://github.com/internetisalie/openchamber/releases';
const numberedForkVersion = /^\d+\.\d+\.\d+-internetisalie\.[1-9]\d*$/;

export const UpdateDialog: React.FC<UpdateDialogProps> = ({ open, onOpenChange, info, error }) => {
  const { t } = useI18n();
  // Construct the link locally. An older remote host can return upstream URLs.
  const releaseUrl = info?.version && numberedForkVersion.test(info.version)
    ? `${FORK_RELEASES_URL}/tag/v${info.version}`
    : FORK_RELEASES_URL;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-5" showCloseButton={true}>
        <DialogTitle>{t('updateDialog.header.updateAvailable')}</DialogTitle>
        <p className="typography-ui font-mono">{info?.currentVersion} → {info?.version}</p>
        <p className="typography-meta text-muted-foreground">{t('updateDialog.manualInstall.description')}</p>
        <a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="typography-meta break-all text-primary underline">{releaseUrl}</a>
        {info?.body && (
          <ScrollableOverlay className="max-h-96">
            <SimpleMarkdownRenderer content={info.body} enableFileReferences={false} />
          </ScrollableOverlay>
        )}
        {error && <p className="typography-meta text-[var(--status-error)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('dialog.common.actions.close')}</Button>
          <Button onClick={() => void openExternalUrl(releaseUrl)}>{t('updateDialog.manualInstall.openReleases')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
