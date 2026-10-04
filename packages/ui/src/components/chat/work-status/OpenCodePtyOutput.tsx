import React from 'react';

import { TerminalViewport } from '@/components/terminal/TerminalViewport';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useFontPreferences } from '@/hooks/useFontPreferences';
import { CODE_FONT_OPTION_MAP, DEFAULT_MONO_FONT } from '@/lib/fontOptions';
import { useI18n } from '@/lib/i18n';
import { observeOpenCodePtyOutput, type OpenCodePtyOutputState } from '@/lib/opencode/pty-observer';
import type { OpenCodePtySession } from '@/lib/opencode/pty-bridge';
import { convertThemeToXterm } from '@/lib/terminalTheme';
import { useUIStore } from '@/stores/useUIStore';

const EMPTY_OUTPUT_STATE: OpenCodePtyOutputState = { status: 'pending', chunks: [], stale: false };

type Props = {
  session: OpenCodePtySession;
  visible?: boolean;
};

export const OpenCodePtyOutput: React.FC<Props> = ({ session, visible = true }) => {
  const { t } = useI18n();
  const { currentTheme } = useThemeSystem();
  const { monoFont } = useFontPreferences();
  const fontSize = useUIStore((state) => state.terminalFontSize);
  const [output, setOutput] = React.useState<OpenCodePtyOutputState>(EMPTY_OUTPUT_STATE);

  React.useEffect(() => {
    if (!visible) {
      setOutput(EMPTY_OUTPUT_STATE);
      return;
    }
    return observeOpenCodePtyOutput(session.id, setOutput);
  }, [session.id, visible]);

  const theme = React.useMemo(() => convertThemeToXterm(currentTheme), [currentTheme]);
  const fontFamily = React.useMemo(() => {
    const fallback = CODE_FONT_OPTION_MAP[monoFont] ?? CODE_FONT_OPTION_MAP[DEFAULT_MONO_FONT];
    return window.getComputedStyle(document.documentElement).getPropertyValue('--font-family-mono').trim() || fallback.stack;
  }, [monoFont]);

  return (
    <div className="relative min-h-0 flex-1" style={{ backgroundColor: theme.background }}>
      {visible ? (
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
          isVisible={visible}
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
  );
};
