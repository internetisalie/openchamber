import { expect, test } from 'bun:test';
import type { Session } from '@/lib/opencode/model';
import type { SessionSidebarRowModelArgs, SessionSidebarRowModel } from './sessionSidebarRowModel';
import { buildCanonicalLocationRows, nativeLocationKey, locationAnnotations } from './canonical-location-model';
import { dispatchSessionKey, parseDispatchProjection, type WorkspaceDispatchAttribution } from './dispatch-projection';
import { loadDispatchProjections, planDispatchProjectionReads } from './dispatch-projection-loader';

const source = 'native-source-a';
const session = (id: string, directory = '/work/main', extra: Partial<Session> = {}): Session => ({
  id, projectID: 'native-project', directory, title: id, time: { created: 1, updated: 2 }, cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, ...extra,
});
const args = (sessions: readonly Session[], extra: Partial<SessionSidebarRowModelArgs> = {}): SessionSidebarRowModelArgs => ({
  mode: 'normal', sections: [{ project: { id: 'display-project', normalizedPath: '/work', label: 'Example' }, groups: [] }],
  authoritativeSections: [], chatGroup: null, foldersMap: {}, groupSearchDataByGroup: new WeakMap(), normalizedQuery: '',
  collapsedProjects: new Set(), collapsedGroups: new Set(), collapsedFolders: new Set(), collapsedActivities: new Set(),
  expandedParents: new Set(), visibleCountByContainer: new Map(), pinnedSessionIds: new Set(), sessionOrderIndex: new Map(),
  groupStatusByKey: new Map(), folderAuthorityByOwner: new Map(), sessionOwnerById: new Map(sessions.map((s) => [s.id,
    { projectId: 'display-project', projectRoot: '/work', scopeDirectory: s.directory, kind: 'project' as const }])),
  activeProjectId: 'display-project', singleProjectMode: false, singleProjectId: null, showOnlyMainWorkspace: false,
  hideDirectoryControls: false, ...extra,
});
const build = (sessions: readonly Session[], extra: Partial<SessionSidebarRowModelArgs> = {}, order: 'manual' | 'a-z' | 'recent' = 'manual', manualOrder: string[] = []) =>
  buildCanonicalLocationRows(args(sessions, extra), { sessions, source, workspaceOrder: order, manualOrder, archiveOnly: false, dispatchAttribution: { status: 'unsupported' } });
const sessionIds = (model: SessionSidebarRowModel) => model.rows.flatMap((row) => row.kind === 'session'
  ? [row.node.session.id] : row.kind === 'location-group' && row.lead ? [row.lead.session.id] : []);
const expanded = (...values: [string, string][]) => new Set(values.map(([kind, value]) => nativeLocationKey(source, kind, value)));

const projectionText = (workspace: string, sessionID: string | undefined, lane = 'loom.location') => JSON.stringify({
  schema: 'loom.dispatch-projection.v1', status: 'known', workspace, sessionID,
  ...(sessionID ? { agent: 'implementer' } : {}),
  context: { container: '/runtime/container', lane, item: { repository: 'forge.example/loom', subPath: 'register/tasks', id: 'TASK-1' },
    phase: { selector: 'phase 2: sidebar' } },
});
const projected = (sessions: readonly Session[], attribution: WorkspaceDispatchAttribution, extra: Partial<SessionSidebarRowModelArgs> = {}) =>
  buildCanonicalLocationRows(args(sessions, { mode: 'search', normalizedQuery: '', ...extra }), { sessions, source,
    workspaceOrder: 'a-z', manualOrder: [], archiveOnly: false, dispatchAttribution: attribution });

test('generated native projection input flows through scoped reads into marked lead and external seat workspace placement', async () => {
  const values = [session('lead', '/work/main', { metadata: { loom: { laneLead: 'loom.location' } } }),
    session('child', '/work/main', { parentID: 'lead' }), session('seat', '/work/external', { title: 'implementer 1', agent: 'coder' })];
  const attribution = await loadDispatchProjections({ source, targets: planDispatchProjectionReads(values), signal: new AbortController().signal,
    isCurrent: () => true, files: { readNativeFile: async (path, options) => {
      const selected = path.includes('session-projection/') ? path.split('/').pop()!.slice(0, -5) : undefined;
      return { status: 'read', content: projectionText(options.directory, selected) };
    } } });
  if (!attribution) throw new Error('Projection load must complete');
  const model = projected(values, attribution);
  expect(sessionIds(model)).toEqual(['lead', 'child', 'seat']);
  expect(model.rows.filter((row) => row.kind === 'location-group' && row.groupKind === 'lane')).toHaveLength(1);
  expect(model.rows.find((row) => row.kind === 'location-group' && row.directory === '/work/external')).toMatchObject({ depth: 1, lead: undefined });
  expect(model.rows.find((row) => row.kind === 'session' && row.node.session.id === 'seat')).toMatchObject({
    node: { session: { title: 'implementer 1', agent: 'coder', directory: '/work/external' } },
    locationFacts: { dispatch: { status: 'known', agent: 'implementer', context: { lane: 'loom.location',
      item: { repository: 'forge.example/loom', subPath: 'register/tasks', id: 'TASK-1' }, phase: { selector: 'phase 2: sidebar' } } } },
  });
  expect(new Set(sessionIds(model)).size).toBe(values.length);
});

test('known default creates a lane without inventing a lead or historical attribution', () => {
  const values = [session('old', '/work/external'), session('absent', '/work/external')];
  const attribution: WorkspaceDispatchAttribution = { status: 'scoped', source,
    workspaces: new Map([['/work/external', parseDispatchProjection(projectionText('/work/external', undefined), '/work/external')]]),
    sessions: new Map([
      [dispatchSessionKey('/work/external', 'old'), { schema: 'loom.dispatch-projection.v1', status: 'legacy-unknown', workspace: '/work/external', sessionID: 'old', agent: 'planner' }],
      [dispatchSessionKey('/work/external', 'absent'), { schema: 'loom.dispatch-projection.v1', status: 'missing', workspace: '/work/external', sessionID: 'absent' }],
    ]) };
  const model = projected(values, attribution);
  expect(model.rows.find((row) => row.kind === 'location-group' && row.groupKind === 'lane')).toMatchObject({ label: 'loom.location', lead: undefined });
  expect(sessionIds(model)).toEqual(['old', 'absent']);
  expect(model.rows.find((row) => row.kind === 'session' && row.node.session.id === 'old')).toMatchObject({
    locationFacts: { dispatch: { status: 'legacy-unknown', agent: 'planner' } } });
  const historical = model.rows.find((row) => row.kind === 'session' && row.node.session.id === 'old');
  if (historical?.kind !== 'session') throw new Error('Historical row required');
  expect(historical.locationFacts?.dispatch).not.toHaveProperty('context');
});

test('conflicting historical lane leaves workspace at project root and retains both records', () => {
  const value = session('seat', '/work/external');
  const attribution: WorkspaceDispatchAttribution = { status: 'scoped', source,
    workspaces: new Map([['/work/external', parseDispatchProjection(projectionText('/work/external', undefined), '/work/external')]]),
    sessions: new Map([[dispatchSessionKey('/work/external', 'seat'), parseDispatchProjection(projectionText('/work/external', 'seat', 'loom.other'), '/work/external', 'seat')]]) };
  const model = projected([value], attribution);
  expect(model.rows.some((row) => row.kind === 'location-group' && row.groupKind === 'lane')).toBe(false);
  expect(model.rows.find((row) => row.kind === 'location-group')).toMatchObject({ depth: 0, placementConflict: true,
    dispatchAttribution: { status: 'known', context: { lane: 'loom.location' } } });
  expect(model.rows.find((row) => row.kind === 'session')).toMatchObject({ locationFacts: { placementConflict: true,
    dispatch: { status: 'known', context: { lane: 'loom.other' } } } });
});

test('foreign-source projections cannot group equal native IDs or directories in the current source', () => {
  const value = session('seat', '/work/external');
  const model = projected([value], { status: 'scoped', source: 'another-source',
    workspaces: new Map([['/work/external', parseDispatchProjection(projectionText('/work/external', undefined), '/work/external')]]),
    sessions: new Map([[dispatchSessionKey('/work/external', 'seat'), parseDispatchProjection(projectionText('/work/external', 'seat'), '/work/external', 'seat')]]) });
  expect(model.rows.some((row) => row.kind === 'location-group' && row.groupKind === 'lane')).toBe(false);
  expect(sessionIds(model)).toEqual(['seat']);
  expect(model.rows.find((row) => row.kind === 'session')).toMatchObject({ locationFacts: { dispatch: { status: 'unsupported' } } });
});

test('default-only lanes retain project-qualified group identity across native projects', () => {
  const values = [session('one', '/project-one'), session('two', '/project-two')];
  const attribution: WorkspaceDispatchAttribution = { status: 'scoped', source, sessions: new Map(),
    workspaces: new Map(values.map((value) => [value.directory, parseDispatchProjection(projectionText(value.directory, undefined), value.directory)])) };
  const model = projected(values, attribution, {
    sections: [{ project: { id: 'p1', normalizedPath: '/project-one' }, groups: [] },
      { project: { id: 'p2', normalizedPath: '/project-two' }, groups: [] }],
    sessionOwnerById: new Map(values.map((value, n) => [value.id, { projectId: `p${n + 1}`, projectRoot: value.directory,
      scopeDirectory: value.directory, kind: 'project' as const }])),
  });
  const laneRows = model.rows.filter((row) => row.kind === 'location-group' && row.groupKind === 'lane');
  expect(laneRows).toHaveLength(2);
  expect(new Set(model.rows.map((row) => row.key)).size).toBe(model.rows.length);
  expect(sessionIds(model)).toEqual(['one', 'two']);
  expect(model.sessionById.get('one')?.projectID).toBe('native-project');
});

test('ambiguous lead markers remain ordinary sessions and native cycles are not dropped', () => {
  const values = [session('a', '/work/main', { parentID: 'b' }), session('b', '/work/main', { parentID: 'a' }),
    session('one', '/work/main', { metadata: { loom: { laneLead: 'duplicate' } } }),
    session('two', '/work/main', { metadata: { loom: { laneLead: 'duplicate' } } })];
  const model = build(values, { mode: 'search', normalizedQuery: '' });
  expect(model.rows.some((row) => row.kind === 'location-group' && row.groupKind === 'lane')).toBe(false);
  expect(sessionIds(model).sort()).toEqual(['a', 'b', 'one', 'two']);
});

test('missing parents remain visible and single-project scope excludes unowned sessions', () => {
  const values = [session('orphan', '/work/main', { parentID: 'missing' }), session('foreign', '/notes')];
  const model = build(values, { singleProjectMode: true, singleProjectId: 'display-project',
    sessionOwnerById: new Map([['orphan', args(values).sessionOwnerById.get('orphan')!]]),
    expandedParents: expanded(['workspace', '/work/main'], ['workspace', '/notes']) });
  expect(sessionIds(model)).toEqual(['orphan']);
});

test('cross-project native descendants stay beneath their lead and explicit finished children collapse', () => {
  const lead = session('lead', '/work/main', { metadata: { loom: { laneLead: 'example.location' } } });
  const child = session('child', '/other', { parentID: 'lead', metadata: { loom: { finished: true } } });
  const model = build([lead, child], { sessionOwnerById: new Map([['lead', args([lead]).sessionOwnerById.get('lead')!]]),
    expandedParents: expanded(['lane', 'lead'], ['workspace', '/other']) });
  expect(sessionIds(model)).toEqual(['lead']);
  expect(model.selectionDescendantIds).toContain('child');
  const open = build([lead, child], { expandedParents: expanded(['lane', 'lead'], ['finished', 'lane:lead']) });
  expect(sessionIds(open)).toEqual(['lead', 'child']);
});

test('archive admission uses native timestamp semantics, not timestamp truthiness', () => {
  const values = [session('reopened', '/work/main', { time: { created: 1, updated: 10, archived: 5 } }),
    session('negative', '/work/main', { time: { created: 1, updated: 10, archived: -1 } })];
  expect(sessionIds(build(values, { expandedParents: expanded(['workspace', '/work/main']) }))).toEqual(['reopened']);
});

test('draft-only workspaces retain their native draft row without manufacturing a session', () => {
  const draft = { id: 'draft-one', directory: '/work/draft', projectId: 'display-project', text: 'draft',
    mentions: [], attachments: [], createdAt: 1, updatedAt: 2 };
  const model = build([], { draftsByGroupKey: new Map([['draft-group', [draft]]]),
    expandedParents: expanded(['workspace', '/work/draft']) });
  expect(model.rows.map((row) => row.kind)).toEqual(['project-header', 'location-group', 'draft']);
  expect(model.rows[2]).toMatchObject({ draft, projectId: 'display-project' });
  expect(model.sessionById.size).toBe(0);
});

test('explicitly finished leads collapse without treating an idle lead as finished', () => {
  const closed = session('closed-lead', '/work/closed', { metadata: { loom: { laneLead: 'closed', finished: true } } });
  const idle = session('idle-lead', '/work/idle', { metadata: { loom: { laneLead: 'idle' } } });
  expect(sessionIds(build([closed, idle]))).toEqual(['idle-lead']);
  expect(sessionIds(build([closed, idle], { expandedParents: expanded(['finished', 'lead:closed-lead']) })))
    .toEqual(['closed-lead', 'idle-lead']);
});

test('only an explicit native lead marker creates a lane; title, agent, parentlessness and dispatch-shaped metadata do not', () => {
  const legacy = session('legacy', '/work/legacy', { title: 'loom.location implementer 1', agent: 'coder' });
  const arbitrary = session('unattributed', '/work/other', { metadata: { lane: 'loom.location' } });
  expect(build([legacy, arbitrary]).rows.some((row) => row.kind === 'location-group' && row.groupKind === 'lane')).toBe(false);
  expect(locationAnnotations(legacy)).toBeUndefined();
});

test('canonical lead occurs once, native children stay directly under it, own workspace retains other sessions', () => {
  const lead = session('lead', '/work/main', { metadata: { loom: { laneLead: 'example.location' } } });
  const child = session('native-child', '/other/native-directory', { parentID: 'lead' });
  const other = session('other');
  const seat = session('seat', '/work/external', { title: 'implementer 1', agent: 'coder' });
  const model = build([lead, child, other, seat], { expandedParents: expanded(['lane', 'lead'], ['workspace', '/work/main'], ['workspace', '/work/external']) });
  expect(sessionIds(model)).toEqual(['lead', 'native-child', 'other', 'seat']);
  expect(new Set(sessionIds(model)).size).toBe(4);
  const rows = model.rows;
  expect(rows.find((row) => row.kind === 'session' && row.node.session.id === 'native-child')).toMatchObject({ depth: 1, groupDirectory: '/other/native-directory' });
  expect(rows.find((row) => row.kind === 'location-group' && row.directory === '/work/main' && row.groupKind === 'workspace')).toMatchObject({ depth: 1 });
  expect(rows.find((row) => row.kind === 'location-group' && row.directory === '/work/external')).toMatchObject({ depth: 0, dispatchAttribution: { status: 'unsupported' } });
  expect(child.directory).toBe('/other/native-directory');
  expect(seat.parentID).toBeUndefined();
});

test('collapsed lane does not leak its children or duplicate lead into workspaces', () => {
  const lead = session('lead', '/work/main', { metadata: { loom: { laneLead: 'example.location' } } });
  const child = session('child', '/work/other', { parentID: 'lead' });
  const model = build([lead, child], { expandedParents: expanded(['workspace', '/work/main'], ['workspace', '/work/other']) });
  expect(sessionIds(model)).toEqual(['lead']);
});

test('missing attribution keeps workspaces at project level, even if a manifest-like metadata lane is present', () => {
  const value = session('seat', '/work/proposal', { metadata: { manifest: { lane: 'example.location' } } });
  const model = build([value], { expandedParents: expanded(['workspace', '/work/proposal']) });
  expect(model.rows.find((row) => row.kind === 'location-group')).toMatchObject({ groupKind: 'workspace', depth: 0, directory: '/work/proposal' });
  expect(sessionIds(model)).toEqual(['seat']);
});

test('workspace manual and alphabetical order are independent of session activity', () => {
  const values = [session('z', '/work/z', { time: { created: 1, updated: 99 } }), session('a', '/work/a')];
  const directories = (model: SessionSidebarRowModel) => model.rows.flatMap((row) => row.kind === 'location-group' && row.groupKind === 'workspace' ? [row.directory] : []);
  expect(directories(build(values))).toEqual(['/work/a', '/work/z']);
  expect(directories(build(values, {}, 'a-z'))).toEqual(['/work/a', '/work/z']);
  expect(directories(build(values, {}, 'manual', [nativeLocationKey(source, 'workspace', '/work/a')]))).toEqual(['/work/a', '/work/z']);
  expect(directories(build(values, {}, 'recent'))).toEqual(['/work/z', '/work/a']);
});

test('only explicit finished closure creates a collapsed finished group; idle is not closure', () => {
  const values = [session('idle'), session('closed', '/work/main', { metadata: { loom: { finished: true } } })];
  const model = build(values, { expandedParents: expanded(['workspace', '/work/main']) });
  expect(sessionIds(model)).toEqual(['idle']);
  expect(model.rows.find((row) => row.kind === 'location-group' && row.groupKind === 'finished')).toMatchObject({ expanded: false });
  expect(sessionIds(build(values, { expandedParents: expanded(['workspace', '/work/main'], ['finished', '/work/main']) }))).toEqual(['idle', 'closed']);
});

test('archives are a separate projection including VS Code, with no mixed active/archive bucket', () => {
  const values = [session('active'), session('archived', '/work/main', { time: { created: 1, updated: 2, archived: 3 } })];
  const input = args(values, { expandedParents: expanded(['workspace', '/work/main']) });
  expect(sessionIds(build(values, input))).toEqual(['active']);
  const archive = buildCanonicalLocationRows(input, { sessions: values, source, workspaceOrder: 'manual', manualOrder: [], archiveOnly: true, dispatchAttribution: { status: 'unsupported' } });
  expect(sessionIds(archive)).toEqual(['archived']);
  expect(archive.rows.some((row) => row.kind === 'group-header')).toBe(false);
});

test('qualified native keys do not alias across runtimes; foreign predecessor objects and absent annotations stay unknown', () => {
  expect(nativeLocationKey('server-a', 'session', 'same')).not.toBe(nativeLocationKey('server-b', 'session', 'same'));
  const values = [session('one', '/work/main', { metadata: { loom: { predecessor: 'two' } } }), session('two')];
  const rows = build(values, { expandedParents: expanded(['workspace', '/work/main']) }).rows;
  expect(rows.find((row) => row.kind === 'session' && row.node.session.id === 'one')).toMatchObject({ locationFacts: { predecessor: { id: 'two' } } });
  expect(locationAnnotations(session('foreign', '/work/main', { metadata: { loom: { predecessor: { source: 'other', id: 'two' } } } }))).toBeUndefined();
});

test('a plain directory renders once without invented project, repo, SHA or materialization identity', () => {
  const value = session('note', '/notes', { projectID: 'global' });
  const model = build([value], { sections: [], sessionOwnerById: new Map(), expandedParents: expanded(['workspace', '/notes']) });
  expect(model.rows.map((row) => row.kind)).toEqual(['location-group', 'session']);
  expect(model.rows[0]).toMatchObject({ label: '/notes', projectId: null, directory: '/notes' });
  expect(model.rows[0]).not.toHaveProperty('repo');
  expect(model.rows[0]).not.toHaveProperty('sha');
});

test('search preserves canonical hierarchy and selection ignores duplicate zone placement inputs', () => {
  const value = session('ses_target');
  const model = build([value], { mode: 'search', normalizedQuery: 'ses_target', timeEntries: [],
    pinnedItems: [{ node: { session: value, children: [], worktree: null }, projectId: 'display-project', groupDirectory: '/work/main', secondaryMeta: null }],
    movedSessionIds: new Set(['ses_target']), zoneSessionIds: new Set(['ses_target']) });
  expect(sessionIds(model)).toEqual(['ses_target']);
  expect(model.selectionEntries.map((entry) => entry.id)).toEqual(['ses_target']);
  expect(model.searchMatchCount).toBe(1);
});
