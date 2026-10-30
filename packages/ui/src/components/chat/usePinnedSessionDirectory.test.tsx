import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OpenCode } from '@opencode/client';
import type { Session } from '@/lib/opencode/model';
import { adoptSessionMove } from '@/sync/session-actions';
import { SyncProvider } from '@/sync/sync-context';
import { getSyncChildStores } from '@/sync/sync-refs';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';

import { usePinnedSessionDirectory } from './usePinnedSessionDirectory';

// Directory stores persist their session lists, so each test gets its own pair.
let run = 0;
let parentDirectory = '';
let worktreeDirectory = '';

const child = (directory: string): Session => ({
  id: 'child',
  parentID: 'parent',
  projectID: 'project',
  directory,
  title: 'Child',
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 1 },
});

describe('a pinned chat column follows its session across a move', () => {
  const previousProjects = useProjectsStore.getState().projects;
  const previousWorktrees = useSessionUIStore.getState().availableWorktreesByProject;
  const previousGlobalSessions = useGlobalSessionsStore.getState();
  let win: Window;
  let root: Root;
  let restoreGlobals: () => void;
  let shown: string | null = null;
  const sdk = OpenCode.make({ baseUrl: 'http://pinned.test', fetch: () => new Promise<Response>(() => undefined) });

  const Probe = ({ directory }: { directory: string | null }) => {
    shown = usePinnedSessionDirectory({ sessionId: 'child', directory });
    return null;
  };
  const render = async (directory: string | null) => {
    await act(async () => root.render(
      <SyncProvider sdk={sdk} directory={parentDirectory}>
        <Probe directory={directory} />
      </SyncProvider>,
    ));
  };
  const publishChild = async (session: Session) => {
    const store = getSyncChildStores().ensureChild(parentDirectory, { bootstrap: false });
    await act(async () => store.setState({ session: [session], sessionTotal: 1 }));
  };

  beforeEach(() => {
    run += 1;
    useGlobalSessionsStore.getState().removeSessions(['child']);
    parentDirectory = `/pinned-${run}/repo`;
    worktreeDirectory = `/pinned-${run}/repo-wt`;
    useProjectsStore.setState({ projects: [{ id: 'project', path: parentDirectory }] });
    useSessionUIStore.setState({ availableWorktreesByProject: new Map([
      [parentDirectory, [{ path: worktreeDirectory, projectDirectory: parentDirectory, branch: 'task', label: 'task' }]],
    ]) });
    win = new Window({ url: 'http://localhost' });
    const values = { window: win, document: win.document, navigator: win.navigator, localStorage: win.localStorage, IS_REACT_ACT_ENVIRONMENT: true };
    const previous = Object.keys(values).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    restoreGlobals = () => {
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    };
    root = createRoot(document.createElement('div'));
    shown = null;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    await win.happyDOM.close();
    restoreGlobals();
    useProjectsStore.setState({ projects: previousProjects });
    useSessionUIStore.setState({ availableWorktreesByProject: previousWorktrees });
    useGlobalSessionsStore.setState(previousGlobalSessions, true);
  });

  test('reads the destination once OpenCode moves the session', async () => {
    await render(parentDirectory);
    await publishChild(child(parentDirectory));
    expect(shown).toBe(parentDirectory);

    await act(async () => adoptSessionMove('child', parentDirectory, worktreeDirectory));

    expect(shown).toBe(worktreeDirectory);
  });

  test('keeps the opened directory until the record is known or while it names the same place', async () => {
    await render(parentDirectory);
    expect(shown).toBe(parentDirectory);

    await publishChild(child(`${parentDirectory}/`));
    expect(shown).toBe(parentDirectory);
  });

  test('does not expose an unregistered destination to the pinned chat renderer', async () => {
    await render(parentDirectory);
    await publishChild(child(parentDirectory));
    await act(async () => adoptSessionMove('child', parentDirectory, `/unregistered-pinned-${run}`));
    expect(shown).toBeNull();
  });

  test('reevaluates authoritative Global identity at the same unregistered directory', async () => {
    const directory = `/global-pinned-${run}`;
    await act(async () => useGlobalSessionsStore.getState().upsertSession({ ...child(directory), projectID: 'global' }));
    await render(directory);
    expect(shown).toBe(directory);

    await act(async () => useGlobalSessionsStore.getState().upsertSession(child(directory)));
    expect(shown).toBeNull();

    await act(async () => useGlobalSessionsStore.getState().upsertSession({ ...child(directory), projectID: 'global' }));
    expect(shown).toBe(directory);
  });

  test('reacts to live identity changes before the global index knows the session', async () => {
    const directory = `/live-global-pinned-${run}`;
    await render(directory);
    await publishChild({ ...child(directory), projectID: 'global' });
    expect(shown).toBe(directory);

    await publishChild(child(directory));
    expect(shown).toBeNull();
  });

  test('follows an indexed Global move even while a live child store retains the old directory', async () => {
    const source = `/global-source-${run}`;
    const destination = `/global-destination-${run}`;
    await act(async () => useGlobalSessionsStore.getState().upsertSession({ ...child(source), projectID: 'global' }));
    await render(source);
    await publishChild({ ...child(source), projectID: 'global' });
    expect(shown).toBe(source);

    await act(async () => useGlobalSessionsStore.getState().upsertSession({ ...child(destination), projectID: 'global' }));
    expect(shown).toBe(destination);
  });

  test('does not admit an ordinary pinned session beside a different Global record', async () => {
    const directory = `/mixed-global-pinned-${run}`;
    await act(async () => useGlobalSessionsStore.getState().upsertSessions([
      { ...child(directory), id: 'global-neighbor', projectID: 'global' },
      child(directory),
    ]));
    await render(directory);
    expect(shown).toBeNull();
  });

  const restrictedRuntimes: ReadonlyArray<'capacitor' | 'vscode'> = ['capacitor', 'vscode'];
  for (const runtime of restrictedRuntimes) {
    test(`keeps unregistered Global columns hidden in ${runtime}`, async () => {
      Object.assign(win, runtime === 'capacitor'
        ? { Capacitor: { isNativePlatform: () => true } }
        : { __VSCODE_CONFIG__: {} });
      const directory = `/restricted-global-pinned-${run}`;
      await act(async () => useGlobalSessionsStore.getState().upsertSession({ ...child(directory), projectID: 'global' }));
      await render(directory);
      expect(shown).toBeNull();
    });
  }
});
