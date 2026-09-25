import React from 'react';

import { TerminalViewport } from '@/components/terminal/TerminalViewport';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useFontPreferences } from '@/hooks/useFontPreferences';
import { CODE_FONT_OPTION_MAP, DEFAULT_MONO_FONT } from '@/lib/fontOptions';
import { useI18n } from '@/lib/i18n';
import { observeOpenCodePtyOutput, type OpenCodePtyOutputState } from '@/lib/openCodePtyObserver';
import type { OpenCodePtySession } from '@/lib/opencodePtyApi';
import { convertThemeToXterm } from '@/lib/terminalTheme';
import { useUIStore } from '@/stores/useUIStore';

const EMPTY_OUTPUT_STATE: OpenCodePtyOutputState = { status: 'pending', chunks: [], stale: false };

type Props = {
  session: OpenCodePtySession | null;
  onOpenChange: (open: boolean) => void;
};

export const OpenCodePtyOutputDialog: React.FC<Props> = ({ session, onOpenChange }) => {
  const { t } = useI18n();
  const { currentTheme } = useThemeSystem();
  const { monoFont } = useFontPreferences();
  const fontSize = useUIStore((state) => state.terminalFontSize);
  const [output, setOutput] = React.useState<OpenCodePtyOutputState>(EMPTY_OUTPUT_STATE);

  React.useEffect(() => {
    if (!session) {
      setOutput(EMPTY_OUTPUT_STATE);
      return;
    }
    return observeOpenCodePtyOutput(session.id, setOutput);
  }, [session]);

  const theme = React.useMemo(() => convertThemeToXterm(currentTheme), [currentTheme]);
  const fontFamily = React.useMemo(() => {
    const fallback = CODE_FONT_OPTION_MAP[monoFont] ?? CODE_FONT_OPTION_MAP[DEFAULT_MONO_FONT];
    if (typeof window === 'undefined') return fallback.stack;
    return window.getComputedStyle(document.documentElement).getPropertyValue('--font-family-mono').trim() || fallback.stack;
  }, [monoFont]);

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

        <div className="relative min-h-0 flex-1" style={{ backgroundColor: theme.background }}>
          {session ? (
            <TerminalViewport
              sessionKey={`opencode-pty::${session.id}`}
              chunks={output.chunks}
              onInput={() => undefined}
              onResize={() => undefined}
              theme={theme}
              monoFont={monoFont}
              fontFamily={fontFamily}
              fontSize={fontSize}
              enableTouchScroll
              autoFocus={false}
              isVisible
              readOnly
              className="px-2 pb-3 pt-2"
            />
          ) : null}

          {output.chunks.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {output.status === 'pending'
                ? t('common.loading')
                : output.status === 'not-found'
                  ? t('chat.workStatus.pty.outputMissing')
                  : output.status === 'unavailable'
                  ? t('chat.workStatus.pty.outputUnavailable')
                    : t('chat.toolOutputDialog.noOutputProduced')}
            </div>
          ) : null}

          {output.stale ? (
            <div className="absolute inset-x-0 bottom-0 bg-[var(--status-warning-background)] px-3 py-2 text-xs text-[var(--status-warning)]">
              {t('chat.workStatus.pty.refreshFailed')}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};
