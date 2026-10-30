import { afterEach, beforeEach, describe, expect, jest, spyOn, test } from 'bun:test';
import { getOpenCodeTrustSnapshot, settleOpenCodeTrust, forgetOpenCodeTrustDeclines } from '@/lib/opencodeTrust';
import { configureRuntimeUrlResolver, getRuntimeUrlResolver, setRuntimeUrlResolver } from '@/lib/runtime-url';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import type { Session } from '@/lib/opencode/model';
import { useSessionUIStore } from './session-ui-store';
import { admitSession, isSessionAdmitted, subscribeSessionAdmission } from './session-admission';
import { ensureChatsRootDirectory } from '@/lib/chatDirectories';
import { opencodeClient } from '@/lib/opencode/client';
import { isGlobalSessionTarget, isSessionTargetAdmitted } from './session-admission-rule';
import { useSpaceArchivesStore } from '@/lib/spaces/space-archives';

const session = (id: string, directory: string): Session => ({
  id, directory, projectID: 'external', title: id, time: { created: 1, updated: 1 },
  cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
});
const settle = async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); };
const originalFetch = globalThis.fetch;
const originalResolver = getRuntimeUrlResolver();
const originalProjects = useProjectsStore.getState();
const originalGlobal = useGlobalSessionsStore.getState();
const originalUI = useSessionUIStore.getState();
let trusted = false;
let runsCode = true;
let registrations: string[];
let trustWrites = 0;
let trustReads = 0;
let trustFailures = 0;
let registrationReads = 0;
let registrationFailures = 0;

beforeEach(() => {
  trusted = false; runsCode = true; registrations = []; trustWrites = 0;
  trustReads = 0; trustFailures = 0; registrationReads = 0; registrationFailures = 0;
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
      return Response.json({ project: { id: body.directory, path: body.directory } });
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
});

describe('session admission', () => {
  test('Global active and archived records need no project registration or trust prompt', async () => {
    const active = { ...session('global-active', '/outside'), projectID: 'global' };
    const archived = { ...session('global-archived', '/archive-outside'), projectID: 'global', time: { created: 1, updated: 1, archived: 2 } };
    useGlobalSessionsStore.getState().upsertSession(active);
    useGlobalSessionsStore.getState().upsertSession(archived);
    const stop = subscribeSessionAdmission();
    try {
      await settle();
      expect(await admitSession(active.id, active.directory)).toBe(true);
      expect(await admitSession(archived.id, archived.directory)).toBe(true);
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
      expect(getOpenCodeTrustSnapshot()?.directory).toBe('/shared-outside');
      expect(registrationReads).toBe(0);
      expect(await admitSession('global-shared', '/shared-outside')).toBe(true);
      await settleOpenCodeTrust('skip');
      await settle();
      expect(await admitSession('ordinary-shared', '/shared-outside')).toBe(false);
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
      await settle();
      expect(getOpenCodeTrustSnapshot()?.directory).toBe('/outside');
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
    useGlobalSessionsStore.getState().upsertSession(session('retry-trust', '/retry-trust'));
    const stop = subscribeSessionAdmission();
    try {
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

  test('retries failed registration, bounds repeated failures and cancels retries on disposal', async () => {
    jest.useFakeTimers();
    trusted = true;
    registrationFailures = 100;
    useGlobalSessionsStore.getState().upsertSession(session('retry-registration', '/retry-registration'));
    const stop = subscribeSessionAdmission();
    try {
      await settle();
      for (const delay of [1000, 2000, 4000]) { jest.advanceTimersByTime(delay); await settle(); }
      expect(registrationReads).toBe(4);
      jest.advanceTimersByTime(60_000); await settle();
      expect(registrationReads).toBe(4);
      expect(isSessionAdmitted('/retry-registration')).toBe(false);
    } finally { stop(); }

    useGlobalSessionsStore.getState().upsertSession(session('disposed', '/disposed'));
    const dispose = subscribeSessionAdmission();
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
    useGlobalSessionsStore.getState().upsertSession(session('transient-registration', '/transient-registration'));
    const stop = subscribeSessionAdmission();
    try {
      await settle();
      expect(registrationReads).toBe(1);
      expect(isSessionAdmitted('/transient-registration')).toBe(false);
      jest.advanceTimersByTime(1000); await settle();
      expect(registrationReads).toBe(2);
      expect(isSessionAdmitted('/transient-registration')).toBe(true);
    } finally { stop(); }
  });

  test('registers archived-only folders and observes new archived destinations', async () => {
    runsCode = false;
    const archived = { ...session('archived', '/archive-only'), time: { created: 1, updated: 1, archived: 2 } };
    useGlobalSessionsStore.getState().upsertSession(archived);
    const stop = subscribeSessionAdmission();
    try {
      await settle();
      expect(isSessionAdmitted('/archive-only')).toBe(true);
      expect(useGlobalSessionsStore.getState().activeSessions).toHaveLength(0);
      expect(useGlobalSessionsStore.getState().archivedSessions).toHaveLength(1);
      useGlobalSessionsStore.getState().upsertSession({ ...archived, directory: '/archive-moved' });
      await settle();
      expect(isSessionAdmitted('/archive-moved')).toBe(true);
      expect(useGlobalSessionsStore.getState().activeSessions).toHaveLength(0);
      expect(useGlobalSessionsStore.getState().archivedSessions).toHaveLength(1);
      expect(useGlobalSessionsStore.getState().entityById.get(archived.id)?.time).toEqual(archived.time);
      expect(registrations).toEqual(['/archive-only', '/archive-moved']);
    } finally { stop(); }
  });

  test('newer authoritative activity reactivates a Global record without registering its directory', async () => {
    const archived = { ...session('resumed-global', '/outside'), projectID: 'global', time: { created: 1, updated: 1, archived: 2 } };
    useGlobalSessionsStore.getState().upsertSession(archived);
    const stop = subscribeSessionAdmission();
    try {
      await settle();
      expect(useGlobalSessionsStore.getState().activeSessions).toHaveLength(0);
      expect(useGlobalSessionsStore.getState().archivedSessions.map((entry) => entry.id)).toEqual([archived.id]);
      const resumed = { ...archived, time: { ...archived.time, updated: 3 } };
      useGlobalSessionsStore.getState().upsertSession(resumed);
      await settle();
      expect(useGlobalSessionsStore.getState().activeSessions.map((entry) => entry.id)).toEqual([archived.id]);
      expect(useGlobalSessionsStore.getState().archivedSessions).toHaveLength(0);
      expect(useGlobalSessionsStore.getState().entityById.get(archived.id)?.time).toEqual(resumed.time);
      expect(isSessionAdmitted(resumed.directory, resumed)).toBe(true);
      expect(isSessionAdmitted(resumed.directory)).toBe(false);
      expect(trustReads).toBe(0);
      expect(registrationReads).toBe(0);
    } finally { stop(); }
  });

  test('an archived-only declined folder stays hidden without retrying the user decision', async () => {
    jest.useFakeTimers();
    useGlobalSessionsStore.getState().upsertSession({ ...session('archived-denied', '/archive-denied'), time: { created: 1, updated: 1, archived: 2 } });
    const stop = subscribeSessionAdmission();
    try {
      await settle();
      expect(getOpenCodeTrustSnapshot()?.directory).toBe('/archive-denied');
      await settleOpenCodeTrust('skip'); await settle();
      const readsAfterDecline = trustReads;
      expect(readsAfterDecline).toBe(2); // Initial assessment and the queued prompt's recheck.
      jest.advanceTimersByTime(60_000); await settle();
      expect(trustReads).toBe(readsAfterDecline);
      expect(registrationReads).toBe(0);
      expect(isSessionAdmitted('/archive-denied')).toBe(false);
      expect(useGlobalSessionsStore.getState().archivedSessions).toHaveLength(1);
    } finally { stop(); }
  });

  test('active and archived sessions sharing a folder use one admission request', async () => {
    trusted = true;
    useGlobalSessionsStore.getState().upsertSession(session('active-shared', '/shared'));
    useGlobalSessionsStore.getState().upsertSession({ ...session('archived-shared', '/shared'), time: { created: 1, updated: 1, archived: 2 } });
    const stop = subscribeSessionAdmission();
    try {
      await settle();
      expect(trustReads).toBe(1);
      expect(registrationReads).toBe(1);
    } finally { stop(); }
  });
  test('resolves the server-owned chat root before importing a persisted managed chat', async () => {
    expect(await admitSession('chat', '/managed/chats/day/session-chat')).toBe(true);
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
    expect(await admitSession('one', '/empty')).toBe(true);
    expect(registrations).toEqual(['/empty']);
    expect(getOpenCodeTrustSnapshot()).toBeNull();
    expect(trustWrites).toBe(0);
    expect(useProjectsStore.getState().activeProjectId).toBe('kept');
    expect(isSessionAdmitted('/empty')).toBe(true);
  });

  test('auto-adds an already trusted fingerprint without asking again', async () => {
    trusted = true;
    expect(await admitSession('one', '/trusted')).toBe(true);
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
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(trustWrites).toBe(1);
    expect(registrations).toEqual(['/outside']);
  });

  test('declining keeps the project absent and background rediscovery does not ask again', async () => {
    const first = admitSession('one', '/declined');
    await settle();
    await settleOpenCodeTrust('skip');
    expect(await first).toBe(false);
    expect(await admitSession('one', '/declined')).toBe(false);
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
    expect(await admission).toBe(false);
    expect(registrations).toEqual([]);
  });

  test('discovery preserves the raw global cache after decline', async () => {
    useGlobalSessionsStore.getState().upsertSession(session('external', '/blocked'));
    const stop = subscribeSessionAdmission();
    try {
      await settle();
      expect(getOpenCodeTrustSnapshot()?.directory).toBe('/blocked');
      await settleOpenCodeTrust('skip');
      await settle();
      expect(useGlobalSessionsStore.getState().entityById.has('external')).toBe(true);
      expect(useGlobalSessionsStore.getState().activeSessions.map((entry) => entry.id)).toEqual(['external']);
      expect(isSessionAdmitted('/blocked')).toBe(false);
    } finally { stop(); }
  });

  test('a global-only move clears the viewed session before admitting its destination', async () => {
    useGlobalSessionsStore.getState().upsertSession(session('viewed', '/kept'));
    useSessionUIStore.setState({ currentSessionId: 'viewed', currentSessionDirectory: '/kept' });
    const stop = subscribeSessionAdmission();
    try {
      useGlobalSessionsStore.getState().upsertSession(session('viewed', '/global-move'));
      await settle();
      expect(useSessionUIStore.getState().currentSessionId).toBeNull();
      expect(getOpenCodeTrustSnapshot()?.directory).toBe('/global-move');
      await settleOpenCodeTrust('skip');
      await settle();
      expect(isSessionAdmitted('/global-move')).toBe(false);
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

  test('runtime-memory restoration does not publish an unregistered session before trust', async () => {
    useGlobalSessionsStore.getState().upsertSession(session('remembered', '/remembered-unknown'));
    useSessionUIStore.setState({ currentSessionId: 'remembered', currentSessionDirectory: '/remembered-unknown' });
    useSessionUIStore.getState().prepareForRuntimeSwitch();
    useSessionUIStore.setState({ currentSessionId: null, currentSessionDirectory: null });
    useSessionUIStore.getState().restoreForRuntimeSwitch();
    await settle();
    expect(useSessionUIStore.getState().currentSessionId).toBeNull();
    expect(getOpenCodeTrustSnapshot()?.directory).toBe('/remembered-unknown');
    await settleOpenCodeTrust('skip');
  });
});
