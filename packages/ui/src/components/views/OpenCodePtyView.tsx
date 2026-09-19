import React from 'react';

import { TerminalViewport } from '@/components/terminal/TerminalViewport';
import { Button } from '@/components/ui/button';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useFontPreferences } from '@/hooks/useFontPreferences';
import { useDeviceInfo } from '@/lib/device';
import { CODE_FONT_OPTION_MAP, DEFAULT_MONO_FONT } from '@/lib/fontOptions';
import { useI18n } from '@/lib/i18n';
import {
  listOpenCodePtySessions,
  probeOpenCodePtyBridge,
  readOpenCodePtyOutput,
  type OpenCodePtySession,
} from '@/lib/opencodePtyApi';
import { appendBoundedOpenCodePtyChunk } from '@/lib/opencodePtyOutput';
import { convertThemeToXterm } from '@/lib/terminalTheme';
import { cn } from '@/lib/utils';
import type { TerminalChunk } from '@/stores/useTerminalStore';
import { useUIStore } from '@/stores/useUIStore';

const SESSION_POLL_MS = 2000;
const OUTPUT_POLL_MS = 500;

type OpenCodePtyViewProps = {
  visible: boolean;
};

const statusKey = (status: OpenCodePtySession['status']) => {
  if (status === 'running') return 'terminalView.pty.status.running' as const;
  if (status === 'killing') return 'terminalView.pty.status.stopping' as const;
  return 'terminalView.pty.status.exited' as const;
};

export const OpenCodePtyView: React.FC<OpenCodePtyViewProps> = ({ visible }) => {
  const { t } = useI18n();
  const { currentTheme } = useThemeSystem();
  const { monoFont } = useFontPreferences();
  const { isMobile, isTablet } = useDeviceInfo();
  const fontSize = useUIStore((state) => state.terminalFontSize);
  const [available, setAvailable] = React.useState(false);
  const [sessions, setSessions] = React.useState<OpenCodePtySession[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [chunks, setChunks] = React.useState<TerminalChunk[]>([]);
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const [sessionLoadFailed, setSessionLoadFailed] = React.useState(false);
  const [outputLoadFailed, setOutputLoadFailed] = React.useState(false);
  const [retryNonce, setRetryNonce] = React.useState(0);
  const cursorRef = React.useRef<number | undefined>(undefined);

  const theme = React.useMemo(() => convertThemeToXterm(currentTheme), [currentTheme]);
  const fontFamily = React.useMemo(() => {
    const fallback = CODE_FONT_OPTION_MAP[monoFont] ?? CODE_FONT_OPTION_MAP[DEFAULT_MONO_FONT];
    if (!globalThis.window) return fallback.stack;
    return window.getComputedStyle(document.documentElement).getPropertyValue('--font-family-mono').trim() || fallback.stack;
  }, [monoFont]);

  React.useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const load = async (expectedGeneration: number) => {
      controller?.abort();
      controller = new AbortController();
      try {
        const capability = await probeOpenCodePtyBridge(controller.signal);
        if (cancelled || expectedGeneration !== generation) return;
        if (capability.status !== 'available') {
          setAvailable(false);
          setSessions([]);
          setSelectedId(null);
          setSessionLoadFailed(capability.status === 'authentication-error');
          setHasLoaded(true);
          return;
        }
        const result = await listOpenCodePtySessions(controller.signal);
        if (cancelled || expectedGeneration !== generation) return;
        setAvailable(true);
        setSessions(result.sessions);
        setSelectedId((current) => current && result.sessions.some((session) => session.id === current)
          ? current
          : result.sessions[0]?.id ?? null);
        setSessionLoadFailed(false);
        setHasLoaded(true);
      } catch {
        if (!cancelled && !controller.signal.aborted && expectedGeneration === generation) {
          setSessionLoadFailed(true);
          setHasLoaded(true);
        }
      } finally {
        if (!cancelled && expectedGeneration === generation) {
          timer = setTimeout(() => void load(expectedGeneration), SESSION_POLL_MS);
        }
      }
    };
    const resetForRuntime = () => {
      generation += 1;
      clearTimeout(timer);
      controller?.abort();
      setAvailable(false);
      setSessions([]);
      setSelectedId(null);
      setChunks([]);
      setHasLoaded(false);
      setSessionLoadFailed(false);
      setOutputLoadFailed(false);
      cursorRef.current = undefined;
      void load(generation);
    };
    window.addEventListener('openchamber:runtime-endpoint-changed', resetForRuntime);
    void load(generation);
    return () => {
      cancelled = true;
      generation += 1;
      clearTimeout(timer);
      controller?.abort();
      window.removeEventListener('openchamber:runtime-endpoint-changed', resetForRuntime);
    };
  }, [retryNonce, visible]);

  React.useEffect(() => {
    cursorRef.current = undefined;
    setChunks([]);
    setOutputLoadFailed(false);
    if (!visible || !available || !selectedId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const resetForRuntime = () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
    window.addEventListener('openchamber:runtime-endpoint-changed', resetForRuntime);
    const load = async () => {
      try {
        const result = await readOpenCodePtyOutput(selectedId, cursorRef.current, controller.signal);
        if (cancelled) return;
        setChunks((current) => appendBoundedOpenCodePtyChunk(result.reset ? [] : current, result.revision, result.data));
        cursorRef.current = result.revision;
        setOutputLoadFailed(false);
      } catch {
        if (!cancelled && !controller.signal.aborted) setOutputLoadFailed(true);
      } finally {
        if (!cancelled) timer = setTimeout(load, OUTPUT_POLL_MS);
      }
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
      window.removeEventListener('openchamber:runtime-endpoint-changed', resetForRuntime);
    };
  }, [available, selectedId, visible]);

  const selected = sessions.find((session) => session.id === selectedId) ?? null;
  const touchTerminal = isMobile || isTablet;

  if (!hasLoaded) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center typography-meta text-muted-foreground">
        {t('common.loading')}
      </div>
    );
  }

  if (!available) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="typography-ui font-medium text-foreground">{t('terminalView.pty.unavailable.title')}</p>
        <p className="max-w-md typography-meta text-muted-foreground">{t('terminalView.pty.unavailable.description')}</p>
        {sessionLoadFailed ? (
          <Button size="sm" variant="outline" onClick={() => {
            setHasLoaded(false);
            setRetryNonce((value) => value + 1);
          }}>
            {t('terminalView.actions.retry')}
          </Button>
        ) : null}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center typography-meta text-muted-foreground">
        {t('terminalView.pty.empty.sessions')}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-background)]">
      <div className="shrink-0 border-b border-border/50 px-2 py-2">
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sessions.map((session) => (
            <Button
              key={session.id}
              type="button"
              size="xs"
              variant="chip"
              aria-pressed={session.id === selectedId}
              className="max-w-48 shrink-0"
              onClick={() => setSelectedId(session.id)}
            >
              <span
                aria-hidden="true"
                className={cn('size-1.5 shrink-0 rounded-full', session.status === 'running' ? 'bg-[var(--status-success)]' : 'bg-muted-foreground')}
              />
              <span className="truncate">{session.title}</span>
            </Button>
          ))}
        </div>
        {selected ? (
          <div className="mt-2 flex min-w-0 items-center gap-2 px-1 typography-micro text-muted-foreground">
            <span className="shrink-0">{t(statusKey(selected.status))}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate font-mono" title={`${selected.command} ${selected.args.join(' ')}`}>
              {selected.command} {selected.args.join(' ')}
            </span>
            <span className="ml-auto shrink-0">{t('terminalView.pty.readOnly')}</span>
          </div>
        ) : null}
      </div>
      <div className="relative min-h-0 flex-1" style={{ backgroundColor: theme.background }}>
        <div className="h-full w-full box-border px-2 pb-3 pt-2">
          {selected ? (
            <TerminalViewport
              sessionKey={`opencode-pty::${selected.id}`}
              chunks={chunks}
              onInput={() => {}}
              onResize={() => {}}
              theme={theme}
              monoFont={monoFont}
              fontFamily={fontFamily}
              fontSize={fontSize}
              enableTouchScroll={touchTerminal}
              autoFocus={false}
              isVisible={visible}
            />
          ) : null}
        </div>
        {selected && chunks.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center typography-meta text-muted-foreground">
            {t('terminalView.pty.empty.output')}
          </div>
        ) : null}
        {sessionLoadFailed || outputLoadFailed ? (
          <div className="absolute inset-x-0 bottom-0 bg-[var(--status-error-background)] px-3 py-2 typography-micro text-[var(--status-error-foreground)]">
            {t('terminalView.pty.error.load')}
          </div>
        ) : null}
      </div>
    </div>
  );
};
