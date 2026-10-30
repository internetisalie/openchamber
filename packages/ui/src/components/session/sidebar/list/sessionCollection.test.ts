import { ensureChatsRootDirectory } from '@/lib/chatDirectories';
import { opencodeClient } from '@/lib/opencode/client';
import { describe, expect, test } from 'bun:test';
import type { Session } from '@/lib/opencode/model';
import {
  buildActiveSessionNode,
  buildSidebarSessionProjection,
  getDescendantIds,
  partitionSidebarSessions,
  projectSidebarActiveSessions,
  projectSidebarCollection,
} from './sessionCollection';

const session = (id: string, directory: string | null, projectID = 'project'): Session => {
  // SAFETY: Sidebar projection reads only id, directory, and time from session fixtures.
  return {
    id,
    directory,
    projectID,
    time: { created: 1, updated: 1 },
  } as Session;
};

const managedChatSession = (id: string): Session => ({
  id,
  projectID: 'global',
  directory: `/home/.config/openchamber/chats/2026-08-24/${id}`,
  title: 'Managed chat',
  time: { created: 1, updated: 1 },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
});

describe('projectSidebarActiveSessions', () => {
  test('admits project descendants but not sibling prefixes or differently cased host paths', () => {
    expect(projectSidebarActiveSessions({
      globalActiveSessions: [session('child', '/Kept/subdir'), session('sibling', '/Kept-other'), session('case', '/kept')],
      liveSessions: [], knownDirectories: new Set(['/Kept']), isVSCode: false,
    }).map(entry => entry.id)).toEqual(['child']);
  });
  test('keeps case-insensitive membership local to projection without rewriting request paths', () => {
    const knownDirectories = new Set(['/Users/Developer/Project']);
    const input = {
      globalActiveSessions: [session('known', '/users/developer/project'), session('unknown', '/other')],
      liveSessions: [],
      knownDirectories,
      isVSCode: true,
    };
    expect(projectSidebarActiveSessions(input).map((entry) => entry.id)).toEqual(['known']);
    expect(buildSidebarSessionProjection({
      ...input,
      pinnedSessionIds: new Set(),
      sessionOrderRanks: new Map(),
    }).projectSessions.map((entry) => entry.id)).toEqual(['known']);
    expect([...knownDirectories]).toEqual(['/Users/Developer/Project']);
  });

  test('keeps global precedence and order, then appends missing live sessions', () => {
    const global = [session('global-b', '/workspace/b'), session('global-a', '/workspace/a')];
    const live = [session('global-a', '/workspace/a'), session('live-c', '/workspace/c')];

    expect(projectSidebarActiveSessions({
      globalActiveSessions: global,
      liveSessions: live,
      knownDirectories: new Set(['/workspace/a', '/workspace/b', '/workspace/c']),
      isVSCode: false,
    }).map((entry) => entry.id)).toEqual(['global-b', 'global-a', 'live-c']);
  });

  test('filters unknown VS Code directories', () => {
    const sessions = [session('known', '/workspace/known'), session('unknown', '/workspace/unknown')];

    expect(projectSidebarActiveSessions({
      globalActiveSessions: sessions,
      liveSessions: [],
      knownDirectories: new Set(['/workspace/known']),
      isVSCode: true,
    }).map((entry) => entry.id)).toEqual(['known']);
  });

  test('hides missing or unknown directories for web when no projects are registered', () => {
    const sessions = [session('unknown', '/workspace/unknown'), session('empty', null)];

    expect(projectSidebarActiveSessions({
      globalActiveSessions: sessions,
      liveSessions: [],
      knownDirectories: new Set(),
      isVSCode: false,
    }).map((entry) => entry.id)).toEqual([]);
  });

  test('hides unknown active full-app records without removing raw input records', () => {
    const restored = { ...session('restored', '/deleted/worktrees/feature'), time: { created: 1, updated: 1 } };

    expect(projectSidebarActiveSessions({
      globalActiveSessions: [restored],
      liveSessions: [],
      knownDirectories: new Set(['/workspace/known']),
      isVSCode: false,
    }).map((entry) => entry.id)).toEqual([]);
    expect(restored.id).toBe('restored');
  });

  test('hides archived sessions in unregistered directories too', () => {
    const archived = session('archived', '/workspace/unknown');
    archived.time.archived = 1;

    expect(projectSidebarActiveSessions({
      globalActiveSessions: [archived],
      liveSessions: [],
      knownDirectories: new Set(['/workspace/known']),
      isVSCode: true,
    }).map((entry) => entry.id)).toEqual([]);
  });

  test('does not replace a filtered global record with a live duplicate', () => {
    expect(projectSidebarActiveSessions({
      globalActiveSessions: [session('same', '/workspace/unknown')],
      liveSessions: [session('same', '/workspace/known')],
      knownDirectories: new Set(['/workspace/known']),
      isVSCode: true,
    })).toEqual([]);
  });

  test('classifies authoritative global-project sessions outside configured project ownership', () => {
    const global = session('global', '/workspace/known', 'global');
    const regular = session('regular', '/workspace/known');

    const partition = partitionSidebarSessions([global, regular], false, true);

    expect(partition.globalSessions.map((entry) => entry.id)).toEqual(['global']);
    expect(partition.projectSessions.map((entry) => entry.id)).toEqual(['regular']);
    expect(projectSidebarActiveSessions({
      globalActiveSessions: [global, regular],
      liveSessions: [],
      knownDirectories: new Set(['/workspace/known']),
      isVSCode: false,
    }).map((entry) => entry.id)).toEqual(['regular']);
  });

  test('keeps VS Code global-project records under existing workspace filtering', () => {
    const known = session('known-global', '/workspace/known', 'global');
    const unknown = session('unknown-global', '/workspace/unknown', 'global');

    expect(partitionSidebarSessions([known], true)).toEqual({
      projectSessions: [known],
      chatSessions: [],
      globalSessions: [],
    });
    expect(projectSidebarActiveSessions({
      globalActiveSessions: [known, unknown],
      liveSessions: [],
      knownDirectories: new Set(['/workspace/known']),
      isVSCode: true,
    }).map((entry) => entry.id)).toEqual(['known-global']);
    expect(partitionSidebarSessions([known], false, false).projectSessions).toEqual([known]);
  });
});

describe('projectSidebarCollection', () => {
  test('uses shared Global admission for unregistered directories without admitting ordinary neighbors', () => {
    const records = [session('global', '/outside', 'global'), session('ordinary', '/outside')];
    const projection = buildSidebarSessionProjection({
      globalActiveSessions: records, liveSessions: [], knownDirectories: new Set(), isVSCode: false,
      admissionScope: 'full-app', pinnedSessionIds: new Set(), sessionOrderRanks: new Map(),
    });
    expect(projection.globalSessions.map((entry) => entry.id)).toEqual(['global']);
    expect(projection.orderedSessions.map((entry) => entry.id)).toEqual(['global']);
    expect(projection.projectSessions).toEqual([]);
    expect(projection.sessionById.has('ordinary')).toBe(true);
    expect(records).toHaveLength(2);
  });

  test('Capacitor keeps known-root project sessions and Chats without a hosted Global group', () => {
    const projection = buildSidebarSessionProjection({
      globalActiveSessions: [session('known-global', '/workspace', 'global'), session('outside-global', '/outside', 'global'), managedChatSession('chat')],
      liveSessions: [], knownDirectories: new Set(['/workspace']), isVSCode: false,
      admissionScope: 'capacitor', pinnedSessionIds: new Set(), sessionOrderRanks: new Map(),
    });
    expect(projection.globalSessions).toEqual([]);
    expect(projection.projectSessions.map((entry) => entry.id)).toEqual(['known-global']);
    expect(projection.chatSessions.map((entry) => entry.id)).toEqual(['chat']);
    expect(projection.orderedSessions.some((entry) => entry.id === 'outside-global')).toBe(false);
  });

  test('retains authoritative secondary workspace roots while keeping unregistered siblings hidden', () => {
    const projection = buildSidebarSessionProjection({
      globalActiveSessions: [session('secondary', '/secondary/ai'), session('sibling', '/secondary-other')],
      liveSessions: [], knownDirectories: new Set(['/workspace', '/secondary']), isVSCode: false,
      pinnedSessionIds: new Set(), sessionOrderRanks: new Map(),
    });
    expect(projection.projectSessions.map((entry) => entry.id)).toEqual(['secondary']);
  });

  test('same-ID authoritative identity changes update Global visibility outside known roots', () => {
    const input = { liveSessions: [], knownDirectories: new Set<string>(), isVSCode: false,
      pinnedSessionIds: new Set<string>(), sessionOrderRanks: new Map<string, number>() };
    const before = buildSidebarSessionProjection({ ...input, globalActiveSessions: [session('same', '/outside', 'global')] });
    const after = buildSidebarSessionProjection({ ...input, globalActiveSessions: [session('same', '/outside', 'ordinary')] });
    expect(before.globalSessions.map((entry) => entry.id)).toEqual(['same']);
    expect(after.globalSessions).toEqual([]);
    expect(after.orderedSessions).toEqual([]);
    expect(after.sessionById.get('same')?.projectID).toBe('ordinary');
  });

  test('an empty VS Code window keeps managed Chats and excludes unregistered Global records', () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { __VSCODE_CONFIG__: { workspaceFolders: [] } } });
    try {
      const projection = buildSidebarSessionProjection({
        globalActiveSessions: [managedChatSession('empty-chat'), session('global-outside', '/outside', 'global')],
        liveSessions: [], knownDirectories: new Set(), isVSCode: true,
        pinnedSessionIds: new Set(), sessionOrderRanks: new Map(),
      });
      expect(projection.chatSessions.map((entry) => entry.id)).toEqual(['empty-chat']);
      expect(projection.globalSessions).toEqual([]);
      expect(projection.projectSessions).toEqual([]);
    } finally {
      if (previous) Object.defineProperty(globalThis, 'window', previous);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });

  test('returns the same structural projection for unchanged inputs without module caching', () => {
    const globalActiveSessions = [session('a', '/workspace/a'), session('b', '/workspace/b')];
    const input = {
      globalActiveSessions,
      liveSessions: [],
      knownDirectories: new Set(['/workspace/a', '/workspace/b']),
      isVSCode: false,
    };

    const beforeSelection = projectSidebarCollection(input);
    const afterSelection = projectSidebarCollection(input);

    expect(afterSelection).toEqual(beforeSelection);
  });

  test('rebuilds when a structural session collection input changes', () => {
    const input = {
      globalActiveSessions: [session('a', '/workspace/a')],
      liveSessions: [],
      knownDirectories: new Set(['/workspace/a']),
      isVSCode: false,
    };

    const before = projectSidebarCollection(input);
    const after = projectSidebarCollection({
      ...input,
      globalActiveSessions: [session('a', '/workspace/a'), session('b', '/workspace/a')],
    });

    expect(after).not.toBe(before);
    expect(after.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  test('keeps a global-project managed Chat in Chats without duplicating it into Global or projects', () => {
    const managed = managedChatSession('session-managed');
    const project = session('project', '/workspace/a');
    const projection = buildSidebarSessionProjection({
      globalActiveSessions: [managed, project],
      liveSessions: [],
      knownDirectories: new Set(['/workspace/a']),
      isVSCode: false,
      pinnedSessionIds: new Set(),
      sessionOrderRanks: new Map(),
    });

    expect(projection.chatSessions.map((entry) => entry.id)).toEqual(['session-managed']);
    expect(projection.globalSessions).toEqual([]);
    expect(projection.projectSessions.map((entry) => entry.id)).toEqual(['project']);
    expect(projection.orderedSessions.map((entry) => entry.id).sort()).toEqual(['project', 'session-managed']);
    expect(new Set(projection.orderedSessions.map((entry) => entry.id)).size).toBe(2);
  });

  test('keeps managed Chats out of the VS Code sidebar', () => {
    const managed = managedChatSession('session-managed');

    expect(partitionSidebarSessions([managed], true)).toEqual({ projectSessions: [], chatSessions: [], globalSessions: [] });
    expect(projectSidebarCollection({
      globalActiveSessions: [managed],
      liveSessions: [],
      knownDirectories: new Set(),
      isVSCode: true,
    })).toEqual([]);
  });

  test('keeps a canonical managed chat visible when the server root uses different home casing', () => {
    const managed = session('canonical-chat', '/HOME/.config/openchamber/chats/day/session-a');
    const project = session('project', '/workspace/a');
    const projection = buildSidebarSessionProjection({
      globalActiveSessions: [managed, project], liveSessions: [],
      knownDirectories: new Set(['/workspace/a']), isVSCode: false,
      pinnedSessionIds: new Set(), sessionOrderRanks: new Map(),
    });
    expect(projection.chatSessions.map(entry => entry.id)).toEqual(['canonical-chat']);
    expect(projection.projectSessions.map(entry => entry.id)).toEqual(['project']);
    expect(projection.orderedSessions.map(entry => entry.id)).toContain('canonical-chat');
  });

  test('excludes a /btw fork before project ownership and restores it when the marker is removed', () => {
    const fork = {
      ...session('fork', '/home/.config/openchamber/chats/2026-08-24/session-fork'),
      metadata: { openchamber: { kind: 'btw', originalSessionID: 'parent' } },
    };
    const project = session('project', '/workspace/a');
    const input = {
      liveSessions: [],
      knownDirectories: new Set(['/workspace/a']),
      isVSCode: false,
    };

    expect(projectSidebarCollection({ ...input, globalActiveSessions: [fork, project] }).map((entry) => entry.id)).toEqual(['project']);
    expect(partitionSidebarSessions([fork], false).chatSessions).toEqual([]);

    const promoted = {
      ...fork,
      metadata: { openchamber: {} },
    };
    expect(partitionSidebarSessions([promoted], false).chatSessions.map((entry) => entry.id)).toEqual(['fork']);
  });

  test('keeps a ranked managed root and its active child in the Chats hierarchy', () => {
    const managedRoot = { ...session('managed-root', '/home/.config/openchamber/chats/2026-08-24/session-root'), time: { created: 1, updated: 1 } };
    const managedChild = {
      ...session('managed-child', '/home/.config/openchamber/chats/2026-08-24/session-root'),
      parentID: 'managed-root',
      time: { created: 2, updated: 2 },
    };
    const projectRoot = { ...session('project-root', '/workspace/a'), time: { created: 3, updated: 3 } };

    const projection = buildSidebarSessionProjection({
      globalActiveSessions: [projectRoot, managedRoot, managedChild],
      liveSessions: [],
      knownDirectories: new Set(['/workspace/a']),
      isVSCode: false,
      pinnedSessionIds: new Set(),
      sessionOrderRanks: new Map([['managed-root', 10]]),
    });

    expect(projection.projectSessions.map((entry) => entry.id)).toEqual(['project-root']);
    expect(projection.chatSessions.map((entry) => entry.id)).toEqual(['managed-root', 'managed-child']);
    expect(projection.orderedSessions.map((entry) => entry.id)).toEqual(['managed-root', 'managed-child', 'project-root']);
    expect(projection.childrenMap.get('managed-root')?.map((entry) => entry.id)).toEqual(['managed-child']);
  });

  test('keeps Global hierarchy ordered and out of project projections', () => {
    const globalRoot = { ...session('global-root', '/outside/root', 'global'), time: { created: 3, updated: 3 } };
    const globalChild = {
      ...session('global-child', '/outside/child', 'global'),
      parentID: 'global-root',
      time: { created: 2, updated: 2 },
    };
    const globalGrandchild = {
      ...session('global-grandchild', '/outside/grandchild', 'global'),
      parentID: 'global-child',
      time: { created: 1, updated: 1 },
    };
    const projectRoot = { ...session('project-root', '/workspace/a'), time: { created: 4, updated: 4 } };

    const projection = buildSidebarSessionProjection({
      globalActiveSessions: [globalGrandchild, projectRoot, globalChild, globalRoot],
      liveSessions: [],
      knownDirectories: new Set(['/workspace/a']),
      isVSCode: false,
      pinnedSessionIds: new Set(),
      sessionOrderRanks: new Map(),
    });

    expect(projection.globalSessions.map((entry) => entry.id)).toEqual([
      'global-root',
      'global-child',
      'global-grandchild',
    ]);
    expect(projection.childrenMap.get('global-root')?.map((entry) => entry.id)).toEqual(['global-child']);
    expect(projection.childrenMap.get('global-child')?.map((entry) => entry.id)).toEqual(['global-grandchild']);
    expect(projection.projectSessions.map((entry) => entry.id)).toEqual(['project-root']);
  });

  test('moves a session from Global to configured project ownership after authoritative migration', () => {
    const input = {
      liveSessions: [],
      knownDirectories: new Set(['/workspace/a']),
      isVSCode: false,
      pinnedSessionIds: new Set<string>(),
      sessionOrderRanks: new Map<string, number>(),
    };
    const before = buildSidebarSessionProjection({
      ...input,
      globalActiveSessions: [session('migrating', '/workspace/a', 'global')],
    });
    const after = buildSidebarSessionProjection({
      ...input,
      globalActiveSessions: [session('migrating', '/workspace/a', 'project-a')],
    });

    expect(before.globalSessions.map((entry) => entry.id)).toEqual(['migrating']);
    expect(before.projectSessions).toEqual([]);
    expect(after.globalSessions).toEqual([]);
    expect(after.projectSessions.map((entry) => entry.id)).toEqual(['migrating']);
  });

});

describe('getDescendantIds', () => {
  test('returns a depth-first subtree without exposing session entities', () => {
    const childA = session('child-a', '/workspace/a');
    const grandchild = session('grandchild', '/workspace/a');
    const childB = session('child-b', '/workspace/a');
    const childrenMap = new Map([
      ['root', [childA, childB]],
      ['child-a', [grandchild]],
    ]);

    expect(getDescendantIds(childrenMap, 'root'))
      .toEqual(['child-a', 'grandchild', 'child-b']);
  });

  test('cuts a parent cycle with deterministic unique descendants and excludes the root', () => {
    const childA = session('a', '/workspace/a');
    const childB = session('b', '/workspace/a');
    const childC = session('c', '/workspace/a');
    const childrenMap = new Map([
      ['root', [childA]],
      ['a', [childB, childC]],
      ['b', [childA]],
    ]);

    expect(getDescendantIds(childrenMap, 'root')).toEqual(['a', 'b', 'c']);
    expect(new Set(getDescendantIds(childrenMap, 'root')).size).toBe(3);
  });
});

describe('buildActiveSessionNode', () => {
  const archived = (id: string): Session => ({ ...session(id, '/workspace'), time: { created: 1, updated: 1, archived: 2 } });

  test('nests every active descendant so archive reaches grandchildren', () => {
    const child = session('child', '/workspace');
    const grandchild = session('grandchild', '/workspace');
    const childrenMap = new Map([
      ['root', [child]],
      ['child', [grandchild]],
    ]);

    const node = buildActiveSessionNode(childrenMap, session('root', '/workspace'));

    expect(node.children.map((entry) => entry.session.id)).toEqual(['child']);
    expect(node.children[0]?.children.map((entry) => entry.session.id)).toEqual(['grandchild']);
    expect(node.worktree).toBeNull();
  });

  test('cuts archived children at every depth', () => {
    const activeChild = session('active-child', '/workspace');
    const archivedChild = archived('archived-child');
    const archivedGrandchild = archived('archived-grandchild');
    const childrenMap = new Map([
      ['root', [activeChild, archivedChild]],
      ['active-child', [archivedGrandchild]],
      ['archived-child', [session('hidden-leaf', '/workspace')]],
    ]);

    const node = buildActiveSessionNode(childrenMap, session('root', '/workspace'));

    expect(node.children.map((entry) => entry.session.id)).toEqual(['active-child']);
    expect(node.children[0]?.children).toEqual([]);
  });

  test('stops on a parent cycle', () => {
    const a = session('a', '/workspace');
    const root = session('root', '/workspace');
    const childrenMap = new Map([
      ['root', [a]],
      ['a', [root]],
    ]);

    const node = buildActiveSessionNode(childrenMap, root);

    expect(node.children.map((entry) => entry.session.id)).toEqual(['a']);
    expect(node.children[0]?.children).toEqual([]);
  });
});

const originalHomeInfo = opencodeClient.getFilesystemHomeInfo;
opencodeClient.getFilesystemHomeInfo = async () => ({
  home: '/home',
  canonicalChatsRoot: '/HOME/.config/openchamber/chats',
  canonicalLegacyChatsRoot: '/HOME/.config/openchamber/chats',
});
await ensureChatsRootDirectory();
opencodeClient.getFilesystemHomeInfo = originalHomeInfo;
