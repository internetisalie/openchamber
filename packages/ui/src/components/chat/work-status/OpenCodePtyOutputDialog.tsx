import React from 'react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';
import type { OpenCodePtySession } from '@/lib/opencode/pty-bridge';
import { OpenCodePtyOutput } from './OpenCodePtyOutput';

type Props = {
  session: OpenCodePtySession | null;
  onOpenChange: (open: boolean) => void;
};

export const OpenCodePtyOutputDialog: React.FC<Props> = ({ session, onOpenChange }) => {
  const { t } = useI18n();
  const command = session ? [session.command, ...session.args].join(' ') : '';

  return (
    <Dialog open={session !== null} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(44rem,calc(100dvh-1rem))] w-[min(64rem,calc(100vw-1rem))] max-w-none gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 gap-1 border-b border-[var(--interactive-border)] px-4 py-3 pr-12">
          <div className="flex min-w-0 items-center gap-2">
            <DialogTitle className="min-w-0 truncate">{session?.title}</DialogTitle>
            <span className="shrink-0 text-xs text-muted-foreground">{t('chat.workStatus.pty.readOnly')}</span>
          </div>
          <DialogDescription className="sr-only">{t('chat.workStatus.pty.dialogDescription')}</DialogDescription>
          {session ? (
            <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="min-w-0 truncate font-mono" title={command}>{command}</span>
              <span className="min-w-0 truncate" title={session.workdir}>{session.workdir}</span>
            </div>
          ) : null}
        </DialogHeader>

        {session ? <OpenCodePtyOutput key={session.id} session={session} /> : null}
      </DialogContent>
    </Dialog>
  );
};
