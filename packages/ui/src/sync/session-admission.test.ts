import { afterEach, beforeEach, describe, expect, jest, spyOn, test } from 'bun:test';
import { getOpenCodeTrustSnapshot, settleOpenCodeTrust, forgetOpenCodeTrustDeclines } from '@/lib/opencodeTrust';
import { configureRuntimeUrlResolver, getRuntimeUrlResolver, setRuntimeUrlResolver } from '@/lib/runtime-url';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import type { Session } from '@/lib/opencode/model';
import type { RuntimeAPIs } from '@/lib/api/types';
import { registerRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { useSessionUIStore } from './session-ui-store';
import { admitSession, isSessionAdmitted, subscribeSessionAdmission } from './session-admission';
import { ensureChatsRootDirectory } from '@/lib/chatDirectories';
import { opencodeClient } from '@/lib/opencode/client';
import { isGlobalSessionTarget, isSessionTargetAdmitted } from './session-admission-rule';
import { useSpaceArchivesStore } from '@/lib/spaces/space-archives';
import { applySessionEventsToGlobalSessions } from './session-event-router';
import type { SyncEvent } from '@/lib/opencode/events';
import { useGlobalSyncStore } from './global-sync-store';
import { beginLastSessionRestore } from './last-session-restore';
import { clearLastActiveSession, persistLastActiveSession, readLastActiveSession } from './last-session-cache';
import { getRuntimeKey } from '@/lib/runtime-switch';

const session = (id: string, directory: string): Session => ({
  id, directory, projectID: 'external', title: id, time: { created: 1, updated: 1 },
  cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
});
const patchDirectory = (sessionID: string, directory: string): SyncEvent => ({ type: 'session.patched', properties: { sessionID, patch: { directory } } });
/** OpenCode reports a session's move: the record leaves `from` for `to`. */
const moveSession = (id: string, to: string, from = '/kept') => {
  useGlobalSessionsStore.getState().upsertSession(session(id, from));
  applySessionEventsToGlobalSessions([patchDirectory(id, to)]);
};
const settle = async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); };
const originalFetch = globalThis.fetch;
const originalResolver = getRuntimeUrlResolver();
const originalProjects = useProjectsStore.getState();
const originalGlobal = useGlobalSessionsStore.getState();
const originalUI = useSessionUIStore.getState();
const originalGlobalSync = useGlobalSyncStore.getState();
let trusted = false;
let runsCode = true;
let registrations: string[];
let trustWrites = 0;
let trustReads = 0;
let trustFailures = 0;
let registrationReads = 0;
let registrationFailures = 0;
let registeredProjectPath: string | null = null;
let canonicalDirectory: string | null = null;

beforeEach(() => {
  trusted = false; runsCode = true; registrations = []; trustWrites = 0;
  trustReads = 0; trustFailures = 0; registrationReads = 0; registrationFailures = 0; registeredProjectPath = null;
  canonicalDirectory = null;
  forgetOpenCodeTrustDeclines();
  configureRuntimeUrlResolver({ apiBaseUrl: 'https://admission.test' });
  useProjectsStore.setState({ projects: [{ id: 'kept', path: '/kept' }], activeProjectId: 'kept' });
  useGlobalSessionsStore.setState({ activeSessions: [], archivedSessions: [], entityById: new Map(), hasLoaded: true });
  useSessionUIStore.setState({ currentSessionId: null, currentSessionDirectory: null, availableWorktreesByProject: new Map() });
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/fs/home') return Response.json({ home: '/home', chatsRoot: '/managed/chats' });
    if (url.pathname === '/api/opencode/trust') {
      if (init?.method === 'POST') { trusted = true; trustWrites += 1; }
      else {
        trustReads += 1;
        if (trustFailures-- > 0) return new Response(null, { status: 503 });
      }
      return Response.json({ directory: url.searchParams.get('directory') ?? '/outside', trusted: trusted || !runsCode,
        fingerprint: runsCode ? 'fingerprint' : null,
        items: runsCode ? [{ kind: 'mcp', source: 'opencode.json', name: 'local', detail: 'node server.js' }] : [],
      });
    }
    if (url.pathname === '/api/projects/session-directory') {
      registrationReads += 1;
      if (registrationFailures-- > 0) return new Response(null, { status: 503 });
      const body = JSON.parse(String(init?.body));
      registrations.push(body.directory);
      const path = registeredProjectPath ?? body.directory;
      if (!canonicalDirectory) return Response.json({ project: { id: path, path } });
      // The server moved the session; OpenCode reports it after the answer.
      const moved = canonicalDirectory;
      setTimeout(() => applySessionEventsToGlobalSessions([patchDirectory(body.sessionId, moved)]), 5);
      return Response.json({ project: { id: path, path }, directory: moved });
    }
    return Response.json({});
  }) as typeof fetch;
});
afterEach(async () => {
  await settleOpenCodeTrust('skip');
  await settle();
  jest.useRealTimers();
  globalThis.fetch = originalFetch;
  setRuntimeUrlResolver(originalResolver);
  useProjectsStore.setState(originalProjects, true);
  useGlobalSessionsStore.setState(originalGlobal, true);
  useSessionUIStore.setState(originalUI, true);
  useGlobalSyncStore.setState(originalGlobalSync, true);
});

describe('session admission', () => {
  const linkedProject = { id: 'linked-project', worktree: '/kept', sandboxes: ['/linked'], time: { created: 1, updated: 1 } };

  test('restores the real saved selection when global projects load after mount', async () => {
    const saved = session('saved-linked-session', '/linked');
    const runtimeKey = getRuntimeKey();
    useGlobalSyncStore.setState({ projects: [], ready: false });
    useGlobalSessionsStore.getState().applySnapshot([saved], []);
    persistLastActiveSession(runtimeKey, { sessionId: saved.id, directory: '/linked' });
    const stop = subscribeSessionAdmission();
    try {
      const attempt = beginLastSessionRestore({ selectNow: true, refresh: false })();
      await settle();
      expect(useSessionUIStore.getState().currentSessionId).toBeNull();
      useGlobalSyncStore.setState({ projects: [linkedProject], ready: true });
      expect(await attempt).toBe('restored');
      expect(useSessionUIStore.getState().currentSessionId).toBe(saved.id);
      expect(useSessionUIStore.getState().currentSessionDirectory).toBe('/linked');
      expect(useSessionUIStore.getState().currentSessionKeepsSingleProject).toBe(true);

      useGlobalSyncStore.setState({ projects: [] });
      expect(useSessionUIStore.getState().currentSessionId).toBeNull();
      expect(readLastActiveSession(runtimeKey)?.sessionId).toBe(saved.id);
      useGlobalSyncStore.setState({ projects: [linkedProject] });
      expect(useSessionUIStore.getState().currentSessionId).toBe(saved.id);
      expect(useSessionUIStore.getState().currentSessionKeepsSingleProject).toBe(true);
      expect(trustReads).toBe(0);
      expect(registrationReads).toBe(0);
    } finally {
      stop();
      clearLastActiveSession(runtimeKey);
    }
  });

  test('late global projects do not override a draft the user opens during saved-session restore', async () => {
    const saved = session('saved-before-draft', '/linked');
    const runtimeKey = getRuntimeKey();
    useGlobalSyncStore.setState({ projects: [], ready: false });
    useGlobalSessionsStore.getState().applySnapshot([saved], []);
    persistLastActiveSession(runtimeKey, { sessionId: saved.id, directory: '/linked' });
    const stop = subscribeSessionAdmission();
    try {
      const attempt = beginLastSessionRestore({ selectNow: true, refresh: false })();
      await settle();
      useSessionUIStore.getState().openNewSessionDraft();
      expect(await attempt).toBe('none');
      useGlobalSyncStore.setState({ projects: [linkedProject], ready: true });
      expect(useSessionUIStore.getState().currentSessionId).toBeNull();
      expect(useSessionUIStore.getState().newSessionDraft.open).toBe(true);
      expect(readLastActiveSession(runtimeKey)).toBeNull();
      expect(trustReads).toBe(0);
      expect(registrationReads).toBe(0);
    } finally {
      stop();
      clearLastActiveSession(runtimeKey);
    }
  });

  test('Global active and archived records need no project registration or trust prompt', async () => {
    const active = { ...session('global-active', '/outside'), projectID: 'global' };
    const archived = { ...session('global-archived', '/archive-outside'), projectID: 'global', time: { created: 1, updated: 1, archived: 2 } };
    useGlobalSessionsStore.getState().upsertSession(active);
    useGlobalSessionsStore.getState().upsertSession(archived);
    const stop = subscribeSessionAdmission();
    try {
      await settle();
      expect(await admitSession(active.id, active.directory)).toBe(active.directory);
      expect(await admitSession(archived.id, archived.directory)).toBe(archived.directory);
      expect(isSessionAdmitted(active.directory, active)).toBe(true);
      expect(isSessionAdmitted(active.directory)).toBe(false);
      expect(trustReads).toBe(0);
      expect(registrationReads).toBe(0);
      expect(getOpenCodeTrustSnapshot()).toBeNull();
      expect(useProjectsStore.getState().projects.map((project) => project.path)).toEqual(['/kept']);
    } finally { stop(); }
  });

  test('a Global record cannot admit an ordinary record in the same folder', async () => {
    useGlobalSessionsStore.getState().upsertSession({ ...session('global-shared', '/shared-outside'), projectID: 'global' });
    useGlobalSessionsStore.getState().upsertSession(session('ordinary-shared', '/shared-outside'));
    const stop = subscribeSessionAdmission();
    try {
      await settle();
      const ordinary = admitSession('ordinary-shared', '/shared-outside', true);
      await settle();
      expect(getOpenCodeTrustSnapshot()?.directory).toBe('/shared-outside');
      expect(registrationReads).toBe(0);
      expect(await admitSession('global-shared', '/shared-outside')).toBe('/shared-outside');
      await settleOpenCodeTrust('skip');
      await settle();
      expect(await ordinary).toBeNull();
      expect(registrationReads).toBe(0);
    } finally { stop(); }
  });

  test('changing Global identity at the same directory reinstates ordinary admission', async () => {
    useGlobalSessionsStore.getState().upsertSession({ ...session('identity-change', '/outside'), projectID: 'global' });
    const stop = subscribeSessionAdmission();
    try {
      await settle();
      expect(trustReads).toBe(0);
      useGlobalSessionsStore.getState().upsertSession(session('identity-change', '/outside'));
      expect(isSessionAdmitted('/outside', useGlobalSessionsStore.getState().entityById.get('identity-change'))).toBe(false);
      const request = admitSession('identity-change', '/outside', true);
      await settle();
      expect(getOpenCodeTrustSnapshot()?.directory).toBe('/outside');
      await settleOpenCodeTrust('skip');
      expect(await request).toBeNull();
      expect(registrationReads).toBe(0);
    } finally { stop(); }
  });

  test('selection and a Global-only move retain the authoritative returned directory', async () => {
    useGlobalSessionsStore.getState().upsertSession({ ...session('global-selected', '/outside'), projectID: 'global' });
    const stop = subscribeSessionAdmission();
    try {
      useSessionUIStore.getState().setCurrentSession('global-selected', '/wrong-hint');
      expect(useSessionUIStore.getState().currentSessionId).toBe('global-selected');
      expect(useSessionUIStore.getState().currentSessionDirectory).toBe('/outside');
      useGlobalSessionsStore.getState().upsertSession({ ...session('global-selected', '/new-outside'), projectID: 'global' });
      useSessionUIStore.getState().setSessionDirectory('global-selected', '/new-outside');
      await settle();
      expect(useSessionUIStore.getState().currentSessionId).toBe('global-selected');
      expect(useSessionUIStore.getState().currentSessionDirectory).toBe('/new-outside');
      expect(trustReads).toBe(0);
      expect(registrationReads).toBe(0);
    } finally { stop(); }
  });

  test('an uncached selection resolves Global identity before admitting an unknown hint', async () => {
    const read = spyOn(opencodeClient, 'getSession').mockResolvedValue({ ...session('uncached-global', '/returned-global'), projectID: 'global' });
    try {
      useSessionUIStore.getState().setCurrentSession('uncached-global', '/hint');
      await settle();
      expect(read.mock.calls).toEqual([['uncached-global']]);
      expect(useSessionUIStore.getState().currentSessionId).toBe('uncached-global');
      expect(useSessionUIStore.getState().currentSessionDirectory).toBe('/returned-global');
      expect(trustReads).toBe(0);
      expect(registrationReads).toBe(0);
    } finally { read.mockRestore(); }
  });

  test('runtime-memory restoration uses the same Global admission policy', async () => {
    useGlobalSessionsStore.getState().upsertSession({ ...session('remembered-global', '/remembered-global'), projectID: 'global' });
    useSessionUIStore.getState().setCurrentSession('remembered-global', '/remembered-global');
    useSessionUIStore.getState().prepareForRuntimeSwitch();
    useSessionUIStore.setState({ currentSessionId: null, currentSessionDirectory: null });
    useSessionUIStore.getState().restoreForRuntimeSwitch();
    await settle();
    expect(useSessionUIStore.getState().currentSessionId).toBe('remembered-global');
    expect(useSessionUIStore.getState().currentSessionDirectory).toBe('/remembered-global');
    expect(trustReads).toBe(0);
    expect(registrationReads).toBe(0);
  });

  test('managed Chats retain their own admission in every scope', async () => {
    await ensureChatsRootDirectory();
    const chat = { projectID: 'global', directory: '/managed/chats/day/chat' };
    for (const scope of ['full-app', 'capacitor', 'vscode'] as const) {
      const target = { directory: chat.directory, session: chat };
      expect(isGlobalSessionTarget(target, scope)).toBe(false);
      expect(isSessionTargetAdmitted(target, [], new Map(), scope)).toBe(true);
    }
  });

  test('catalogued deleted-space archives retain their own admission in every scope', () => {
    const previous = useSpaceArchivesStore.getState();
    const directory = '/archived-space';
    useSpaceArchivesStore.setState({ byDirectory: new Map([[directory, { spaceId: '012345abcdef', name: 'Archived', directory }]]) });
    try {
      const target = { directory, session: { projectID: 'global', directory } };
      for (const scope of ['full-app', 'capacitor', 'vscode'] as const) {
        expect(isGlobalSessionTarget(target, scope)).toBe(false);
        expect(isSessionTargetAdmitted(target, [], new Map(), scope)).toBe(true);
      }
    } finally { useSpaceArchivesStore.setState(previous, true); }
  });

  test('a pending Global detail read cannot resurrect a removed session', async () => {
    let finish!: (record: Session) => void;
    const read = spyOn(opencodeClient, 'getSession').mockImplementation(() => new Promise<Session>((resolve) => { finish = resolve; }));
    try {
      useSessionUIStore.getState().setCurrentSession('removed-global', '/hint');
      useGlobalSessionsStore.getState().removeSessions(['removed-global']);
      finish({ ...session('removed-global', '/outside'), projectID: 'global' });
      await settle();
      expect(useGlobalSessionsStore.getState().entityById.has('removed-global')).toBe(false);
      expect(useSessionUIStore.getState().currentSessionId).toBeNull();
      expect(trustReads).toBe(0);
    } finally { read.mockRestore(); }
  });

  test('a newer ordinary record wins over a pending Global detail read', async () => {
    let finish!: (record: Session) => void;
    const read = spyOn(opencodeClient, 'getSession').mockImplementation(() => new Promise<Session>((resolve) => { finish = resolve; }));
    try {
      useSessionUIStore.getState().setCurrentSession('changed-global', '/hint');
      useGlobalSessionsStore.getState().upsertSession(session('changed-global', '/new-ordinary'));
      finish({ ...session('changed-global', '/outside'), projectID: 'global' });
      await settle();
      expect(useGlobalSessionsStore.getState().entityById.get('changed-global')?.projectID).toBe('external');
      expect(useSessionUIStore.getState().currentSessionId).toBeNull();
      expect(getOpenCodeTrustSnapshot()?.directory).toBe('/new-ordinary');
      expect(registrationReads).toBe(0);
    } finally { read.mockRestore(); }
  });

  test('retries a failed trust read after backoff without waiting for a new global load', async () => {
    jest.useFakeTimers();
    trusted = true;
    trustFailures = 1;
    const stop = subscribeSessionAdmission();
    try {
      moveSession('retry-trust', '/retry-trust');
      await settle();
      expect(trustReads).toBe(1);
      expect(isSessionAdmitted('/retry-trust')).toBe(false);
      jest.advanceTimersByTime(999); await settle();
      expect(trustReads).toBe(1);
      jest.advanceTimersByTime(1); await settle();
      expect(trustReads).toBe(2);
      expect(isSessionAdmitted('/retry-trust')).toBe(true);
    } finally { stop(); }
  });

  test('sessions already in unknown folders are never registered or prompted', async () => {
    runsCode = false;
    useGlobalSessionsStore.getState().upsertSession(session('history', '/history'));
    useGlobalSessionsStore.getState().upsertSession({ ...session('archived', '/archive-only'), time: { created: 1, updated: 1, archived: 2 } });
    const stop = subscribeSessionAdmission();
    try {
      await settle();
      useGlobalSessionsStore.getState().upsertSession(session('history-new', '/history-new'));
      await settle();
      expect(trustReads).toBe(0);
      expect(registrations).toEqual([]);
      expect(getOpenCodeTrustSnapshot()).toBeNull();
      expect(isSessionAdmitted('/history')).toBe(false);
    } finally { stop(); }
  });

  test('a move between unknown folders registers nothing', async () => {
    runsCode = false;
    const stop = subscribeSessionAdmission();
    try {
      moveSession('removed-project', '/elsewhere', '/removed-project');
      await settle();
      expect(trustReads).toBe(0);
      expect(registrations).toEqual([]);
    } finally { stop(); }
  });

  test('VS Code never adds workspace folders on its own, even for a move', async () => {
    const vscodeRuntime: Pick<RuntimeAPIs, 'runtime'> = { runtime: { platform: 'vscode', isDesktop: false, isVSCode: true, label: 'VS Code' } };
    // SAFETY: admission reads only the runtime flag. Adding a workspace folder
    // would first read trust, which the test counts.
    registerRuntimeAPIs(vscodeRuntime as RuntimeAPIs);
    runsCode = false;
    useGlobalSessionsStore.getState().upsertSession(session('vscode-history', '/vscode-history'));
    const stop = subscribeSessionAdmission();
    try {
      moveSession('vscode-moved', '/vscode-moved');
      await settle();
      expect(trustReads).toBe(0);
      expect(registrations).toEqual([]);
    } finally {
      stop();
      registerRuntimeAPIs(null);
    }
  });

  test('retries failed registration, bounds repeated failures and cancels retries on disposal', async () => {
    jest.useFakeTimers();
    trusted = true;
    registrationFailures = 100;
    const stop = subscribeSessionAdmission();
    try {
      moveSession('retry-registration', '/retry-registration');
      await settle();
      for (const delay of [1000, 2000, 4000]) { jest.advanceTimersByTime(delay); await settle(); }
      expect(registrationReads).toBe(4);
      jest.advanceTimersByTime(60_000); await settle();
      expect(registrationReads).toBe(4);
      expect(isSessionAdmitted('/retry-registration')).toBe(false);
    } finally { stop(); }

    const dispose = subscribeSessionAdmission();
    moveSession('disposed', '/disposed');
    await settle();
    const reads = registrationReads;
    dispose();
    jest.advanceTimersByTime(60_000); await settle();
    expect(registrationReads).toBe(reads);
  });

  test('a transient registration failure recovers on the first retry', async () => {
    jest.useFakeTimers();
    trusted = true;
    registrationFailures = 1;
    const stop = subscribeSessionAdmission();
    try {
      moveSession('transient-registration', '/transient-registration');
      await settle();
      expect(registrationReads).toBe(1);
      expect(isSessionAdmitted('/transient-registration')).toBe(false);
      jest.advanceTimersByTime(1000); await settle();
      expect(registrationReads).toBe(2);
      expect(isSessionAdmitted('/transient-registration')).toBe(true);
    } finally { stop(); }
  });

  test('a declined move stays hidden, keeps the raw record and is not asked again', async () => {
    jest.useFakeTimers();
    const stop = subscribeSessionAdmission();
    try {
      moveSession('external', '/blocked');
      await settle();
      expect(getOpenCodeTrustSnapshot()?.directory).toBe('/blocked');
      await settleOpenCodeTrust('skip'); await settle();
      const readsAfterDecline = trustReads;
      jest.advanceTimersByTime(60_000); await settle();
      expect(trustReads).toBe(readsAfterDecline);
      expect(registrationReads).toBe(0);
      expect(isSessionAdmitted('/blocked')).toBe(false);
      expect(useGlobalSessionsStore.getState().entityById.has('external')).toBe(true);
    } finally { stop(); }
  });

  test('resolves the server-owned chat root before importing a persisted managed chat', async () => {
    expect(await admitSession('chat', '/managed/chats/day/session-chat')).toBe('/managed/chats/day/session-chat');
    expect(registrations).toEqual([]);
    expect(getOpenCodeTrustSnapshot()).toBeNull();
  });
  test('preserves registered project descendants and known linked worktrees', () => {
    useSessionUIStore.setState({ availableWorktreesByProject: new Map([
      ['/kept', [{ path: '/linked', projectDirectory: '/kept', branch: 'task', label: 'task' }]],
    ]) });
    expect(isSessionAdmitted('/kept/subdirectory')).toBe(true);
    expect(isSessionAdmitted('/linked/subdirectory')).toBe(true);
    expect(isSessionAdmitted('/kept-other')).toBe(false);
    expect(isSessionAdmitted(null)).toBe(false);
  });

  test('auto-adds a folder without executable configuration, without activation or a dialog', async () => {
    runsCode = false;
    expect(await admitSession('one', '/empty')).toBe('/empty');
    expect(registrations).toEqual(['/empty']);
    expect(getOpenCodeTrustSnapshot()).toBeNull();
    expect(trustWrites).toBe(0);
    expect(useProjectsStore.getState().activeProjectId).toBe('kept');
    expect(isSessionAdmitted('/empty')).toBe(true);
  });

  test('auto-adds an already trusted fingerprint without asking again', async () => {
    trusted = true;
    expect(await admitSession('one', '/trusted')).toBe('/trusted');
    expect(registrations).toEqual(['/trusted']);
    expect(getOpenCodeTrustSnapshot()).toBeNull();
  });

  test('keeps code hidden until Trust is saved, then registers once for concurrent requests', async () => {
    const first = admitSession('one', '/outside');
    const second = admitSession('two', '/outside');
    await settle();
    expect(isSessionAdmitted('/outside')).toBe(false);
    expect(getOpenCodeTrustSnapshot()?.directory).toBe('/outside');
    expect(registrations).toEqual([]);
    expect(await settleOpenCodeTrust('trust')).toBe('saved');
    expect(await first).toBe('/outside');
    expect(await second).toBe('/outside');
    expect(trustWrites).toBe(1);
    expect(registrations).toEqual(['/outside']);
  });

  test('declining keeps the project absent and background rediscovery does not ask again', async () => {
    const first = admitSession('one', '/declined');
    await settle();
    await settleOpenCodeTrust('skip');
    expect(await first).toBeNull();
    expect(await admitSession('one', '/declined')).toBeNull();
    expect(getOpenCodeTrustSnapshot()).toBeNull();
    expect(registrations).toEqual([]);
    expect(trustWrites).toBe(0);
  });

  test('an answer for a session that moved again does not register its old destination', async () => {
    useGlobalSessionsStore.getState().upsertSession(session('moving', '/old'));
    const admission = admitSession('moving', '/old');
    await settle();
    useGlobalSessionsStore.getState().upsertSession(session('moving', '/new'));
    await settleOpenCodeTrust('trust');
    expect(await admission).toBeNull();
    expect(registrations).toEqual([]);
  });

  test('a live move of the viewed session puts it aside and brings it back once its folder is admitted', async () => {
    useGlobalSessionsStore.getState().upsertSession(session('viewed', '/kept'));
    useSessionUIStore.setState({ currentSessionId: 'viewed', currentSessionDirectory: '/kept' });
    const stop = subscribeSessionAdmission();
    try {
      moveSession('viewed', '/global-move');
      await settle();
      expect(useSessionUIStore.getState().currentSessionId).toBeNull();
      expect(getOpenCodeTrustSnapshot()?.directory).toBe('/global-move');
      await settleOpenCodeTrust('trust');
      await settle();
      expect(isSessionAdmitted('/global-move')).toBe(true);
      expect(useSessionUIStore.getState().currentSessionId).toBe('viewed');
    } finally { stop(); }
  });

  test('a draft opened while the moved session waits for trust stays on screen', async () => {
    useGlobalSessionsStore.getState().upsertSession(session('viewed-draft', '/kept'));
    useSessionUIStore.setState({ currentSessionId: 'viewed-draft', currentSessionDirectory: '/kept' });
    const stop = subscribeSessionAdmission();
    try {
      moveSession('viewed-draft', '/draft-move');
      await settle();
      useSessionUIStore.getState().openNewSessionDraft();
      await settleOpenCodeTrust('trust');
      await settle();
      expect(isSessionAdmitted('/draft-move')).toBe(true);
      expect(useSessionUIStore.getState().currentSessionId).toBeNull();
    } finally { stop(); }
  });

  test('a parked session that moved on to another unknown folder is not reopened there', async () => {
    useGlobalSessionsStore.getState().upsertSession(session('viewed-twice', '/kept'));
    useSessionUIStore.setState({ currentSessionId: 'viewed-twice', currentSessionDirectory: '/kept' });
    const stop = subscribeSessionAdmission();
    try {
      moveSession('viewed-twice', '/first-stop');
      await settle();
      applySessionEventsToGlobalSessions([patchDirectory('viewed-twice', '/second-stop')]);
      await settleOpenCodeTrust('skip');
      // Another session's move registers the first stop meanwhile.
      useProjectsStore.setState({ projects: [{ id: 'kept', path: '/kept' }, { id: 'first', path: '/first-stop' }] });
      await settle();
      expect(isSessionAdmitted('/second-stop')).toBe(false);
      expect(useSessionUIStore.getState().currentSessionId).toBeNull();
      expect(getOpenCodeTrustSnapshot()).toBeNull();
      expect(registrations).toEqual([]);
    } finally { stop(); }
  });

  test('removing the viewed session\'s project puts it aside without registering the folder again', async () => {
    runsCode = false;
    useProjectsStore.setState({ projects: [{ id: 'kept', path: '/kept' }, { id: 'removed', path: '/removed' }] });
    useGlobalSessionsStore.getState().upsertSession(session('viewed-removed', '/removed'));
    useSessionUIStore.setState({ currentSessionId: 'viewed-removed', currentSessionDirectory: '/removed' });
    const stop = subscribeSessionAdmission();
    try {
      useProjectsStore.setState({ projects: [{ id: 'kept', path: '/kept' }] });
      await settle();
      expect(useSessionUIStore.getState().currentSessionId).toBeNull();
      expect(trustReads).toBe(0);
      expect(registrations).toEqual([]);
    } finally { stop(); }
  });

  test('opening a session in a worktree nobody listed yet asks the server once and opens once it is listed', async () => {
    trusted = true;
    // The server answers with the repository's project and appends nothing.
    registeredProjectPath = '/kept';
    useGlobalSessionsStore.getState().upsertSession(session('in-new-worktree', '/new-worktree'));
    useSessionUIStore.getState().setCurrentSession('in-new-worktree', '/new-worktree');
    for (let round = 0; round < 10; round += 1) { await new Promise((resolve) => setTimeout(resolve, 5)); await settle(); }
    expect(registrationReads).toBe(1);
    expect(useSessionUIStore.getState().currentSessionId).toBeNull();
    // The sidebar lists the worktree on the server's worktree-changed event.
    useSessionUIStore.setState({ availableWorktreesByProject: new Map([
      ['/kept', [{ path: '/new-worktree', projectDirectory: '/kept', branch: 'task', label: 'task' }]],
    ]) });
    await settle(); await settle();
    expect(useSessionUIStore.getState().currentSessionId).toBe('in-new-worktree');
    expect(registrationReads).toBe(1);
  });

  test('opening a session recorded under a symlinked spelling of a listed worktree opens it at the canonical path', async () => {
    trusted = true;
    registeredProjectPath = '/kept';
    canonicalDirectory = '/private/tmp/respelled';
    useSessionUIStore.setState({ availableWorktreesByProject: new Map([
      ['/kept', [{ path: '/private/tmp/respelled', projectDirectory: '/kept', branch: 'task', label: 'task' }]],
    ]) });
    useGlobalSessionsStore.getState().upsertSession(session('respelled', '/tmp/respelled'));
    useSessionUIStore.getState().setCurrentSession('respelled', '/tmp/respelled');
    for (let round = 0; round < 10; round += 1) { await new Promise((resolve) => setTimeout(resolve, 5)); await settle(); }
    expect(registrations).toEqual(['/tmp/respelled']);
    expect(useSessionUIStore.getState().currentSessionId).toBe('respelled');
    expect(useSessionUIStore.getState().currentSessionDirectory).toBe('/private/tmp/respelled');
  });

  test('admitting an unindexed session recorded under a symlinked spelling answers the canonical folder', async () => {
    trusted = true;
    registeredProjectPath = '/kept';
    canonicalDirectory = '/private/tmp/unindexed';
    useSessionUIStore.setState({ availableWorktreesByProject: new Map([
      ['/kept', [{ path: '/private/tmp/unindexed', projectDirectory: '/kept', branch: 'task', label: 'task' }]],
    ]) });
    expect(await admitSession('unindexed', '/tmp/unindexed', true)).toBe('/private/tmp/unindexed');
    expect(registrations).toEqual(['/tmp/unindexed']);
  });

  test('a live move to a symlinked spelling of a listed worktree is admitted once the record follows', async () => {
    trusted = true;
    registeredProjectPath = '/kept';
    canonicalDirectory = '/private/tmp/live-respelled';
    useSessionUIStore.setState({ availableWorktreesByProject: new Map([
      ['/kept', [{ path: '/private/tmp/live-respelled', projectDirectory: '/kept', branch: 'task', label: 'task' }]],
    ]) });
    const stop = subscribeSessionAdmission();
    try {
      moveSession('live-respelled', '/tmp/live-respelled');
      for (let round = 0; round < 10; round += 1) { await new Promise((resolve) => setTimeout(resolve, 5)); await settle(); }
      expect(registrations).toEqual(['/tmp/live-respelled']);
      const record = useGlobalSessionsStore.getState().entityById.get('live-respelled');
      expect(record?.directory).toBe('/private/tmp/live-respelled');
      expect(isSessionAdmitted(record?.directory)).toBe(true);
    } finally { stop(); }
  });

  test('notification and restore selection waits before publishing or changing the directory', async () => {
    useGlobalSessionsStore.getState().upsertSession(session('blocked-open', '/open-blocked'));
    useSessionUIStore.getState().setCurrentSession('blocked-open', '/open-blocked');
    await settle();
    expect(useSessionUIStore.getState().currentSessionId).toBeNull();
    await settleOpenCodeTrust('skip');
    await settle();
    expect(useSessionUIStore.getState().currentSessionId).toBeNull();
    expect(registrations).toEqual([]);
  });

  test('a later navigation wins over a delayed trust answer', async () => {
    useGlobalSessionsStore.getState().upsertSession(session('pending-open', '/pending-open'));
    useSessionUIStore.getState().setCurrentSession('pending-open', '/pending-open');
    await settle();
    useSessionUIStore.getState().setCurrentSession(null);
    await settleOpenCodeTrust('trust');
    await settle();
    expect(useSessionUIStore.getState().currentSessionId).toBeNull();
  });

  test('admission preserves submitted-draft and project-picker selection options', async () => {
    useGlobalSessionsStore.getState().upsertSession(session('options-open', '/options-open'));
    useSessionUIStore.getState().setCurrentSession('options-open', '/options-open', {
      transition: 'submitted-draft', keepSingleProject: true,
    });
    await settle();
    expect(useSessionUIStore.getState().currentSessionId).toBeNull();
    await settleOpenCodeTrust('trust');
    await settle();
    expect(useSessionUIStore.getState().currentSessionId).toBe('options-open');
    expect(useSessionUIStore.getState().materializedDraftSessionId).toBe('options-open');
    expect(useSessionUIStore.getState().currentSessionKeepsSingleProject).toBe(true);
  });

  test('runtime-memory restoration does not reopen or admit a session outside every project', async () => {
    useGlobalSessionsStore.getState().upsertSession(session('remembered', '/remembered-unknown'));
    useSessionUIStore.setState({ currentSessionId: 'remembered', currentSessionDirectory: '/remembered-unknown' });
    useSessionUIStore.getState().prepareForRuntimeSwitch();
    useSessionUIStore.setState({ currentSessionId: null, currentSessionDirectory: null });
    useSessionUIStore.getState().restoreForRuntimeSwitch();
    await settle();
    expect(useSessionUIStore.getState().currentSessionId).toBeNull();
    expect(getOpenCodeTrustSnapshot()).toBeNull();
    expect(registrations).toEqual([]);
  });
});
