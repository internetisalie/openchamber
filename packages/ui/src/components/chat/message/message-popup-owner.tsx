import React from 'react';
import { lazyWithChunkRecovery } from '@/lib/chunkLoadRecovery';
import { useUIStore } from '@/stores/useUIStore';
import type { ToolPopupContent } from './types';
import { MessagePopupContext } from './message-popup-context';

const ToolOutputDialog = lazyWithChunkRecovery(() => import('./ToolOutputDialog'));
/** A column's open message preview outlives virtual rows, but never its conversation. */
export function MessagePopupOwner({ scopeKey, isMobile, children }: {
  scopeKey: string;
  isMobile: boolean;
  children: React.ReactNode;
}) {
  const [entry, setEntry] = React.useState<{ scopeKey: string; popup: ToolPopupContent } | null>(null);
  const scopeRef = React.useRef(scopeKey);
  scopeRef.current = scopeKey;
  const openRef = React.useRef(false);
  const setImagePreviewOpen = useUIStore((state) => state.setImagePreviewOpen);
  if (entry && entry.scopeKey !== scopeKey) setEntry(null);

  React.useEffect(() => () => {
    if (openRef.current) setImagePreviewOpen(false);
    openRef.current = false;
  }, [scopeKey, setImagePreviewOpen]);

  const show = React.useCallback((popup: ToolPopupContent) => {
    if (scopeRef.current !== scopeKey) return;
    setEntry({ scopeKey, popup });
    openRef.current = popup.open;
    setImagePreviewOpen(popup.open);
  }, [scopeKey, setImagePreviewOpen]);

  const onOpenChange = React.useCallback((open: boolean) => {
    if (scopeRef.current !== scopeKey) return;
    setEntry((previous) => previous ? { ...previous, popup: { ...previous.popup, open } } : null);
    openRef.current = open;
    setImagePreviewOpen(open);
  }, [scopeKey, setImagePreviewOpen]);

  return (
    <MessagePopupContext.Provider value={show}>
      {children}
      {entry?.scopeKey === scopeKey ? (
        <React.Suspense fallback={null}>
          <ToolOutputDialog popup={entry.popup} onOpenChange={onOpenChange} isMobile={isMobile} />
        </React.Suspense>
      ) : null}
    </MessagePopupContext.Provider>
  );
}
