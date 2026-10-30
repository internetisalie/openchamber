import { describe, expect, test } from 'bun:test';
import type { Session } from '@/lib/opencode/model';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { installHookTestDom } from '../test-utils/testDom';
import { getSessionAdmissionScope } from '@/sync/session-admission-rule';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';

import {
  findSwitcherItemAncestorIds,
  selectSwitcherParents,
  useSwitcherItems,
  type SwitcherItem,
} from './useSwitcherItems';

const session = (id: string, options: { parentID?: string; archived?: boolean; projectId?: string } = {}): Session => ({
  id,
  parentID: options.parentID,
  time: options.archived ? { archived: Date.now() } : undefined,
  projectId: options.projectId ?? 'project-a',
} as unknown as Session);

const selectParents = (sessions: Session[], currentSessionId: string | null, scopeProjectId: string | null = null): Session[] => (
  selectSwitcherParents(sessions, new Set(), new Map(), scopeProjectId, currentSessionId, (item) => (item as Session & { projectId: string }).projectId)
);

describe('session switcher initial selection', () => {
  test('uses the authoritative Global rule for unregistered records and observes identity replacement', async () => {
    const initialGlobal = useGlobalSessionsStore.getState();
    const initialProjects = useProjectsStore.getState();
    const initialUI = useSessionUIStore.getState();
    const dom = installHookTestDom();
    const root = createRoot(dom.container);
    const record = (id: string, projectID: string): Session => ({
      id, projectID, directory: '/unregistered', title: id, time: { created: 1, updated: 1 },
      cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    });
    let items: SwitcherItem[] = [];
    const Harness = () => { items = useSwitcherItems(true); return null; };
    try {
      useProjectsStore.setState({ projects: [] });
      useSessionUIStore.setState({ availableWorktreesByProject: new Map() });
      useGlobalSessionsStore.getState().applySnapshot([record('global', 'global'), record('ordinary', 'project')], [], 'ready');
      expect(getSessionAdmissionScope()).toBe('full-app');
      expect(useGlobalSessionsStore.getState().entityById.get('global')?.projectID).toBe('global');
      await act(async () => root.render(React.createElement(Harness)));
      expect(items.map((item) => item.node.session.id)).toEqual(['global']);
      expect(items[0]?.groupDirectory).toBe('/unregistered');
      expect(items[0]?.projectId).toBeNull();
      await act(async () => useGlobalSessionsStore.getState().upsertSession(record('global', 'project')));
      expect(items).toEqual([]);
      expect(useGlobalSessionsStore.getState().activeSessions).toHaveLength(2);
    } finally {
      await act(async () => root.unmount());
      useGlobalSessionsStore.setState(initialGlobal, true);
      useProjectsStore.setState(initialProjects, true);
      useSessionUIStore.setState(initialUI, true);
      dom.restore();
    }
  });

  test('finds all local ancestors for a current child session', () => {
    const items: SwitcherItem[] = [{
      node: { session: session('root'), worktree: null, children: [{ session: session('parent', { parentID: 'root' }), worktree: null, children: [{ session: session('child', { parentID: 'parent' }), worktree: null, children: [] }] }] },
      projectId: 'project-a', groupDirectory: null, secondaryMeta: null,
    }];

    expect(findSwitcherItemAncestorIds(items, 'child')).toEqual(['root', 'parent']);
    expect(findSwitcherItemAncestorIds(items, 'missing')).toBeNull();
  });

  test('replaces the final recent slot with the current root and excludes invalid current sessions', () => {
    const roots = Array.from({ length: 8 }, (_, index) => session(`root-${index}`));
    const child = session('child', { parentID: 'root-7' });

    expect(selectParents([...roots, child], 'child').map((item) => item.id)).toEqual([
      'root-0', 'root-1', 'root-2', 'root-3', 'root-4', 'root-5', 'root-7',
    ]);
    expect(selectParents([...roots, child], 'missing').map((item) => item.id)).toEqual(roots.slice(0, 7).map((item) => item.id));
    expect(selectParents([...roots, child], 'child', 'project-b').map((item) => item.id)).toEqual([]);
    expect(selectParents([...roots.slice(0, 7), session('archived', { archived: true })], 'archived').map((item) => item.id)).toEqual(roots.slice(0, 7).map((item) => item.id));
    expect(selectParents([...roots, session('archived-child', { archived: true, parentID: 'root-7' })], 'archived-child').map((item) => item.id)).toEqual(roots.slice(0, 7).map((item) => item.id));
  });
});
