import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Session } from '@opencode-ai/sdk/v2';
import { I18nProvider } from '@/lib/i18n';
import { useSessionActions } from '../sessions/useSessionActions';
import { useSessionGrouping } from './useSessionGrouping';
import type { SessionNode } from '../types';
import type { WorktreeMetadata } from '@/types/worktree';

type FixtureSession = Session & { parentID?: string };
const session = (id: string, parentID?: string): Session => {
  const value: FixtureSession = {
    id,
    slug: id,
    projectID: 'project',
    title: id,
    version: '1',
    directory: '/workspace',
    time: { created: 1, updated: 1 },
  };
  if (parentID) value.parentID = parentID;
  return value;
};

const collectIds = (nodes: SessionNode[]): string[] => {
  const ids: string[] = [];
  const visit = (items: SessionNode[]): void => {
    for (const node of items) {
      ids.push(node.session.id);
      visit(node.children);
    }
  };
  visit(nodes);
  return ids;
};

describe('useSessionGrouping', () => {
  test('keeps same-branch workspace groups distinct and trusts the session directory over stored metadata', () => {
    const projectRoot = '/home/mini/Documents/src/sim';
    const linkedDirectory = '/workspaces/M32.14-review3';
    const independentDirectory = '/workspaces/M32.14-remediation';
    const branch = 'claude/M32.14-plan-remediation';
    const linkedWorktree: WorktreeMetadata = {
      source: 'sdk',
      path: linkedDirectory,
      projectDirectory: projectRoot,
      branch,
      label: branch,
    };
    const independentWorkspace: WorktreeMetadata = {
      ...linkedWorktree,
      path: independentDirectory,
      name: 'M32.14-remediation',
    };
    const linkedSession = {
      ...session('review-session'),
      directory: linkedDirectory,
    };
    const independentSession = {
      ...session('remediation-session'),
      directory: independentDirectory,
      time: { created: 1, updated: 3, archived: 2 },
    };
    type GroupingCapture = { buildGroupedSessions?: ReturnType<typeof useSessionGrouping>['buildGroupedSessions'] };
    const state: GroupingCapture = {};
    const Harness = () => {
      state.buildGroupedSessions = useSessionGrouping({
        homeDirectory: null,
        worktreeMetadata: new Map([
          [linkedSession.id, independentWorkspace],
          [independentSession.id, independentWorkspace],
        ]),
        pinnedSessionIds: new Set(),
        sessionOrderRanks: new Map(),
        gitBranches: new Map([
          [projectRoot, branch],
          [linkedDirectory, branch],
          [independentDirectory, branch],
        ]),
        isVSCode: false,
      }).buildGroupedSessions;
      return null;
    };

    renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(Harness)));
    const buildGroupedSessions = state.buildGroupedSessions;
    if (!buildGroupedSessions) throw new Error('grouping callback was not mounted');

    const groups = buildGroupedSessions(
      [linkedSession, independentSession],
      projectRoot,
      [linkedWorktree],
      branch,
      true,
      [linkedDirectory, independentDirectory],
    );
    const rootGroup = groups.find((group) => group.isMain);
    const linkedGroup = groups.find((group) => group.directory === linkedDirectory);
    const independentGroup = groups.find((group) => group.directory === independentDirectory);

    expect(collectIds(rootGroup?.sessions ?? [])).toEqual([]);
    expect(collectIds(linkedGroup?.sessions ?? [])).toEqual(['review-session']);
    expect(collectIds(independentGroup?.sessions ?? [])).toEqual(['remediation-session']);
    expect(linkedGroup?.sessions[0]?.worktree?.path).toBe(linkedDirectory);
    expect(independentGroup?.worktree).toBeNull();
    expect(independentGroup?.sessions[0]?.worktree).toBeNull();
    expect(linkedGroup?.label).toBe('M32.14-review3');
    expect(independentGroup?.label).toBe('M32.14-remediation');
    expect(linkedGroup?.branch).toBe(branch);
    expect(independentGroup?.branch).toBe(branch);
  });

  test('renders a deterministic cycle/orphan fallback tree without duplicate sessions', async () => {
    type GroupingCapture = { buildGroupedSessions?: ReturnType<typeof useSessionGrouping>['buildGroupedSessions'] };
    const state: GroupingCapture = {};
    const Harness = () => {
      state.buildGroupedSessions = useSessionGrouping({
        homeDirectory: null,
        worktreeMetadata: new Map(),
        pinnedSessionIds: new Set(),
        sessionOrderRanks: new Map(),
        gitBranches: new Map(),
        isVSCode: false,
      }).buildGroupedSessions;
      return null;
    };

    renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(Harness)));
    const buildGroupedSessions = state.buildGroupedSessions;
    if (!buildGroupedSessions) throw new Error('grouping callback was not mounted');

    const groups = buildGroupedSessions(
      [session('a', 'b'), session('b', 'a'), session('orphan', 'missing')],
      '/workspace',
      [],
      null,
      false,
    );
    const rootGroup = groups.find((group) => group.isMain);
    const ids = collectIds(rootGroup?.sessions ?? []);

    expect(ids).toEqual(['orphan', 'a', 'b']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('uses the row-local descendant snapshot for archive and hard-delete actions', async () => {
    type ActionsCapture = { handleDeleteSession?: ReturnType<typeof useSessionActions>['handleDeleteSession'] };
    const state: ActionsCapture = {};
    const Harness = () => {
      state.handleDeleteSession = useSessionActions({
        mobileVariant: false,
        allowReselect: false,
        resetSessionSearch: () => undefined,
        descendantIds: ['active-child', 'archived-child'],
        showDeletionDialog: false,
        setDeleteSessionConfirm: () => undefined,
        deleteSessionConfirm: null,
        setEditingId: () => undefined,
        setEditingRowKey: () => undefined,
        editingSessionId: 'root',
        editingOccurrenceKey: 'project:session:root',
        setEditTitle: () => undefined,
        editingId: null,
        editTitle: '',
        copiedSessionId: null,
        setCopiedSessionId: () => undefined,
      }).handleDeleteSession;
      return null;
    };

    renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(Harness)));
    const handleDeleteSession = state.handleDeleteSession;
    if (!handleDeleteSession) throw new Error('session actions callback was not mounted');

    handleDeleteSession(session('root'));
    handleDeleteSession(session('root'), { hardDelete: true });
  });
});
