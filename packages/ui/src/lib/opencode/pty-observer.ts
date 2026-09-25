import type { TerminalChunk } from '@/stores/useTerminalStore';

import {
  listOpenCodePtySessions,
  OpenCodePtyApiError,
  probeOpenCodePtyBridge,
  readOpenCodePtyOutput,
  type OpenCodePtySession,
} from './pty-bridge';
import { subscribeRuntimeEndpointChanged } from '../runtime-switch';

const SESSION_POLL_MS = 2_000;
const ERROR_RETRY_MS = 5_000;
const OUTPUT_POLL_MS = 500;
const OUTPUT_LIMIT_BYTES = 512 * 1024;
const encoder = new TextEncoder();

export type OpenCodePtySessionState = {
  availability: 'pending' | 'absent' | 'available' | 'authentication-error' | 'unknown';
  sessions: OpenCodePtySession[];
  stale: boolean;
};

export type OpenCodePtyOutputState = {
  status: 'pending' | 'ready' | 'not-found' | 'unavailable';
  chunks: TerminalChunk[];
  stale: boolean;
};

const documentActive = (): boolean =>
  document.visibilityState !== 'hidden' && navigator.onLine !== false;

const statusRank = (status: OpenCodePtySession['status']): number => {
  if (status === 'running') return 0;
  if (status === 'killing') return 1;
  return 2;
};

const sortOpenCodePtySessions = (sessions: OpenCodePtySession[]): OpenCodePtySession[] =>
  sessions
    .map((session, index) => ({ session, index }))
    .sort((left, right) => {
      const status = statusRank(left.session.status) - statusRank(right.session.status);
      if (status !== 0) return status;
      const created = Date.parse(left.session.createdAt) - Date.parse(right.session.createdAt);
      if (Number.isFinite(created) && created !== 0) return created;
      return left.index - right.index;
    })
    .map(({ session }) => session);

const appendBoundedChunk = (chunks: TerminalChunk[], revision: number, data: string): TerminalChunk[] => {
  if (!data) return chunks;
  const next = [...chunks, { id: revision, data, byteLength: encoder.encode(data).byteLength }];
  let bytes = next.reduce((total, chunk) => total + chunk.byteLength, 0);
  while (bytes > OUTPUT_LIMIT_BYTES && next.length > 1) {
    bytes -= next.shift()?.byteLength ?? 0;
  }
  return next;
};

export const observeOpenCodePtySessions = (
  parentSessionId: string,
  listener: (state: OpenCodePtySessionState) => void,
  pollIntervalMs = SESSION_POLL_MS,
): (() => void) => {
  let closed = false;
  let generation = 0;
  let requestSequence = 0;
  let activeRequest = 0;
  let refreshAgain = false;
  let bridgeAvailable = false;
  let successfulSessions: OpenCodePtySession[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const schedule = (delay: number) => {
    clearTimer();
    if (!closed && documentActive()) timer = setTimeout(refresh, delay);
  };
  const publishFailure = (availability: OpenCodePtySessionState['availability']) => {
    listener({
      availability: successfulSessions ? (availability === 'unknown' ? 'available' : availability) : availability,
      sessions: successfulSessions ?? [],
      stale: successfulSessions !== null,
    });
  };
  const refresh = () => {
    clearTimer();
    if (closed || !documentActive()) return;
    if (activeRequest !== 0) {
      refreshAgain = true;
      return;
    }

    const request = ++requestSequence;
    const startedGeneration = generation;
    activeRequest = request;
    refreshAgain = false;
    controller = new AbortController();

    void (async () => {
      if (!bridgeAvailable) {
        const capability = await probeOpenCodePtyBridge(controller?.signal);
        if (closed || generation !== startedGeneration || activeRequest !== request) return 'stale' as const;
        if (capability.status === 'absent') {
          successfulSessions = null;
          listener({ availability: 'absent', sessions: [], stale: false });
          return 'absent' as const;
        }
        if (capability.status === 'authentication-error') {
          publishFailure('authentication-error');
          return 'error' as const;
        }
        bridgeAvailable = true;
      }

      const result = await listOpenCodePtySessions(controller?.signal);
      if (closed || generation !== startedGeneration || activeRequest !== request) return 'stale' as const;
      successfulSessions = sortOpenCodePtySessions(
        result.sessions.filter((session) => session.parentSessionId === parentSessionId),
      );
      listener({ availability: 'available', sessions: successfulSessions, stale: false });
      return 'success' as const;
    })().catch((error) => {
      if (closed || generation !== startedGeneration || activeRequest !== request || controller?.signal.aborted) {
        return 'stale' as const;
      }
      if (error instanceof OpenCodePtyApiError && error.kind === 'authentication') {
        publishFailure('authentication-error');
      } else {
        if (error instanceof OpenCodePtyApiError && error.kind === 'not-found') bridgeAvailable = false;
        publishFailure('unknown');
      }
      return 'error' as const;
    }).then((outcome) => {
      if (closed || generation !== startedGeneration || activeRequest !== request) return;
      activeRequest = 0;
      controller = null;
      if (refreshAgain) refresh();
      else if (outcome === 'success') schedule(pollIntervalMs);
      else if (outcome === 'error') schedule(ERROR_RETRY_MS);
    });
  };
  const pause = () => clearTimer();
  const wake = () => refresh();
  const runtimeChanged = () => {
    generation += 1;
    controller?.abort();
    activeRequest = 0;
    bridgeAvailable = false;
    successfulSessions = null;
    listener({ availability: 'pending', sessions: [], stale: false });
    refresh();
  };

  window.addEventListener('focus', wake);
  window.addEventListener('online', wake);
  window.addEventListener('offline', pause);
  document.addEventListener('visibilitychange', wake);
  const stopRuntimeListener = subscribeRuntimeEndpointChanged(runtimeChanged);
  listener({ availability: 'pending', sessions: [], stale: false });
  refresh();

  return () => {
    closed = true;
    generation += 1;
    clearTimer();
    controller?.abort();
    window.removeEventListener('focus', wake);
    window.removeEventListener('online', wake);
    window.removeEventListener('offline', pause);
    document.removeEventListener('visibilitychange', wake);
    stopRuntimeListener();
  };
};

export const observeOpenCodePtyOutput = (
  sessionId: string,
  listener: (state: OpenCodePtyOutputState) => void,
  pollIntervalMs = OUTPUT_POLL_MS,
): (() => void) => {
  let closed = false;
  let generation = 0;
  let requestSequence = 0;
  let activeRequest = 0;
  let refreshAgain = false;
  let revision: number | undefined;
  let chunks: TerminalChunk[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const schedule = (delay: number) => {
    clearTimer();
    if (!closed && documentActive()) timer = setTimeout(refresh, delay);
  };
  const refresh = () => {
    clearTimer();
    if (closed || !documentActive()) return;
    if (activeRequest !== 0) {
      refreshAgain = true;
      return;
    }

    const request = ++requestSequence;
    const startedGeneration = generation;
    activeRequest = request;
    refreshAgain = false;
    controller = new AbortController();
    void readOpenCodePtyOutput(sessionId, revision, controller.signal).then((result) => {
      if (closed || generation !== startedGeneration || activeRequest !== request) return 'stale' as const;
      chunks = result.reset
        ? (result.data ? [{ id: result.revision, data: result.data, byteLength: encoder.encode(result.data).byteLength }] : [])
        : appendBoundedChunk(chunks, result.revision, result.data);
      revision = result.revision;
      listener({ status: 'ready', chunks, stale: false });
      return 'success' as const;
    }).catch((error) => {
      if (closed || generation !== startedGeneration || activeRequest !== request || controller?.signal.aborted) {
        return 'stale' as const;
      }
      if (error instanceof OpenCodePtyApiError && error.kind === 'not-found') {
        chunks = [];
        listener({ status: 'not-found', chunks, stale: false });
        return 'not-found' as const;
      }
      listener({ status: chunks.length > 0 ? 'ready' : 'unavailable', chunks, stale: chunks.length > 0 });
      return 'error' as const;
    }).then((outcome) => {
      if (closed || generation !== startedGeneration || activeRequest !== request) return;
      activeRequest = 0;
      controller = null;
      if (refreshAgain) refresh();
      else if (outcome === 'success') schedule(pollIntervalMs);
      else if (outcome === 'error') schedule(ERROR_RETRY_MS);
    });
  };
  const pause = () => clearTimer();
  const wake = () => refresh();
  const runtimeChanged = () => {
    generation += 1;
    controller?.abort();
    activeRequest = 0;
    revision = undefined;
    chunks = [];
    listener({ status: 'pending', chunks: [], stale: false });
    refresh();
  };

  window.addEventListener('focus', wake);
  window.addEventListener('online', wake);
  window.addEventListener('offline', pause);
  document.addEventListener('visibilitychange', wake);
  const stopRuntimeListener = subscribeRuntimeEndpointChanged(runtimeChanged);
  listener({ status: 'pending', chunks: [], stale: false });
  refresh();

  return () => {
    closed = true;
    generation += 1;
    clearTimer();
    controller?.abort();
    window.removeEventListener('focus', wake);
    window.removeEventListener('online', wake);
    window.removeEventListener('offline', pause);
    document.removeEventListener('visibilitychange', wake);
    stopRuntimeListener();
  };
};
