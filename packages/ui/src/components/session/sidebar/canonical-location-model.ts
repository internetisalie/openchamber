import { z } from 'zod';
import type { Session } from '@/lib/opencode/model';
import { isSessionArchived } from '@/lib/sessionArchive';
import type { SessionNode } from './types';
import type { SessionTreeGuide } from './sessions/sessionTreeGeometry';
import type { SessionSidebarRow, SessionSidebarRowModel, SessionSidebarRowModelArgs } from './sessionSidebarRowModel';
import { getAuthoritativeSessionFolderOwnerKey } from './sessions/sessionFolderIdentity';
import { sessionProjection, workspaceProjection, type DispatchProjectionState, type WorkspaceDispatchAttribution } from './dispatch-projection';

export type WorkspaceOrder = 'manual' | 'a-z' | 'recent';
export const nativeLocationKey = (source: string, kind: string, value: string): string => JSON.stringify([source, kind, value]);

const annotations = z.object({ loom: z.object({
  laneLead: z.string().trim().min(1).optional(),
  finished: z.boolean().optional(),
  predecessor: z.string().min(1).optional(),
}).optional() });

export function locationAnnotations(session: Session) {
  return annotations.safeParse(session.metadata ?? {}).data?.loom;
}

export type CanonicalLocationGroup = {
  kind: 'location-group'; key: string; estimateSize: number;
  treeGuides?: readonly SessionTreeGuide[];
  groupKind: 'lane' | 'workspace' | 'finished'; label: string; depth: number;
  directory: string | null; projectId: string | null; expansionKey: string; source: string;
  expanded: boolean; lead?: SessionNode; predecessor?: Session | null; previousWorkspaceKey?: string; workspaceSiblingKeys?: string[];
  dispatchAttribution: DispatchProjectionState;
  placementConflict?: boolean;
  leadDispatch?: DispatchProjectionState;
};

type Options = {
  source: string;
  sessions: readonly Session[];
  workspaceOrder: WorkspaceOrder;
  manualOrder: readonly string[];
  archiveOnly: boolean;
  dispatchAttribution: WorkspaceDispatchAttribution;
};

export function buildCanonicalLocationRows(args: SessionSidebarRowModelArgs, options: Options): SessionSidebarRowModel {
  const rows: SessionSidebarRow[] = [];
  const sessionById = new Map<string, Session>();
  for (const session of options.sessions) {
    if (isSessionArchived(session) === options.archiveOnly) sessionById.set(session.id, session);
  }
  const search = args.mode === 'search';
  const query = args.normalizedQuery.trim().toLowerCase();
  const matches = (session: Session) => !query || (query.startsWith('ses_')
    ? session.id.toLowerCase() === query : `${session.title} ${session.directory}`.toLowerCase().includes(query));
  const children = new Map<string, Session[]>();
  for (const session of sessionById.values()) {
    if (!session.parentID || !sessionById.has(session.parentID) || session.parentID === session.id) continue;
    const list = children.get(session.parentID) ?? [];
    list.push(session);
    children.set(session.parentID, list);
  }
  const nodeFor = (session: Session, ancestors = new Set<string>()): SessionNode => {
    const next = new Set(ancestors).add(session.id);
    return { session, worktree: null, children: (children.get(session.id) ?? [])
      .filter((child) => !next.has(child.id)).map((child) => nodeFor(child, next)) };
  };
  const containsMatch = (node: SessionNode): boolean => matches(node.session) || node.children.some(containsMatch);
  const sectionById = new Map(args.sections.map((section) => [section.project.id, section]));
  const emitted = new Set<string>();
  const selectionEntries: SessionSidebarRowModel['selectionEntries'][number][] = [];
  const selectionDescendantIds: string[] = [];
  const folderOwnerKeyBySessionId = new Map<string, string>();
  for (const session of sessionById.values()) {
    const ownerKey = getAuthoritativeSessionFolderOwnerKey(session, args.sessionOwnerById.get(session.id));
    if (ownerKey) folderOwnerKeyBySessionId.set(session.id, ownerKey);
  }
  const key = (kind: string, value: string) => nativeLocationKey(options.source, kind, value);
  const isExpanded = (expansionKey: string) => search || args.expandedParents.has(expansionKey);
  const descendantRange = (session: Session): readonly [number, number] => {
    const start = selectionDescendantIds.length;
    const stack = [...(children.get(session.id) ?? [])];
    const visited = new Set([session.id]);
    while (stack.length) {
      const child = stack.pop();
      if (!child || visited.has(child.id)) continue;
      visited.add(child.id);
      selectionDescendantIds.push(child.id);
      stack.push(...(children.get(child.id) ?? []));
    }
    return [start, selectionDescendantIds.length];
  };
  const appendSession = (session: Session, depth: number, projectId: string | null, includeChildren = true) => {
    if (emitted.has(session.id) || allLeadIds.has(session.id)) return;
    const node = nodeFor(session);
    if (search && !containsMatch(node)) return;
    emitted.add(session.id);
    const rowKey = key('session', session.id);
    const owner = args.sessionOwnerById.get(session.id);
    const ownerKey = folderOwnerKeyBySessionId.get(session.id) ?? null;
    rows.push({ kind: 'session', key: rowKey, estimateSize: 54, node, depth,
      ownsWork: false, projectId, ownerProjectId: owner?.projectId ?? null, groupDirectory: session.directory,
      ownerKey, selectionScopeKey: ownerKey, archived: options.archiveOnly, renderContext: 'project',
      secondaryMeta: null, locationFacts: { source: options.source,
        dispatch: sessionProjection(options.dispatchAttribution, options.source, session.directory, session.id),
        placementConflict: conflictingDirectories.has(session.directory),
        predecessor: sessionById.get(locationAnnotations(session)?.predecessor ?? '') ?? null },
      expanded: includeChildren && node.children.length > 0 ? isExpanded(`project:${options.archiveOnly ? 'archived' : 'active'}:${session.id}`) : undefined,
    });
    selectionEntries.push({ id: session.id, rowKey, scopeKey: ownerKey, archived: options.archiveOnly, descendantRange: descendantRange(session) });
    if (includeChildren && isExpanded(`project:${options.archiveOnly ? 'archived' : 'active'}:${session.id}`)) {
      for (const child of children.get(session.id) ?? []) appendSession(child, depth + 1, projectId);
    }
  };
  const group = (groupKind: CanonicalLocationGroup['groupKind'], value: string, label: string,
    directory: string | null, depth: number, projectId: string | null, lead?: Session, previousWorkspaceKey?: string) => {
    const expansionKey = key(groupKind, value);
    const row: CanonicalLocationGroup = { kind: 'location-group', key: expansionKey, expansionKey, source: options.source,
      estimateSize: lead ? 86 : 34, groupKind, label, directory, depth, projectId,
      expanded: isExpanded(expansionKey), lead: lead ? { session: lead, children: [], worktree: null } : undefined, previousWorkspaceKey,
      predecessor: lead ? sessionById.get(locationAnnotations(lead)?.predecessor ?? '') ?? null : null,
      dispatchAttribution: directory ? workspaceProjection(options.dispatchAttribution, options.source, directory) : { status: 'unrequested' },
      placementConflict: directory ? conflictingDirectories.has(directory) : false,
      leadDispatch: lead ? sessionProjection(options.dispatchAttribution, options.source, lead.directory, lead.id) : undefined };
    rows.push(row);
    if (lead) {
      emitted.add(lead.id);
      selectionEntries.push({ id: lead.id, rowKey: expansionKey, scopeKey: folderOwnerKeyBySessionId.get(lead.id) ?? null,
        archived: options.archiveOnly, descendantRange: descendantRange(lead) });
    }
    return row.expanded;
  };

  const all = [...sessionById.values()];
  const drafts = options.archiveOnly || search ? [] : [...new Map([...(args.draftsByGroupKey?.values() ?? [])]
    .flatMap((values) => values.map((draft) => [draft.id, draft] as const))).values()];
  const candidates = all.filter((session) => locationAnnotations(session)?.laneLead);
  const knownLeads = candidates.filter((session) => candidates.filter((other) =>
    locationAnnotations(other)?.laneLead === locationAnnotations(session)?.laneLead).length === 1);
  const allLeadIds = new Set(knownLeads.map((session) => session.id));
  const conflictingDirectories = new Set<string>();
  for (const session of all) {
    const workspace = workspaceProjection(options.dispatchAttribution, options.source, session.directory);
    const historical = sessionProjection(options.dispatchAttribution, options.source, session.directory, session.id);
    const markedLane = allLeadIds.has(session.id) ? locationAnnotations(session)?.laneLead : undefined;
    if (workspace.status === 'known' && ((historical.status === 'known' && historical.context.lane !== workspace.context.lane)
      || (markedLane && markedLane !== workspace.context.lane))) conflictingDirectories.add(session.directory);
  }
  const belowLead = new Set<string>();
  for (const session of all) {
    let current = session;
    const visited = new Set<string>();
    while (current.parentID && !visited.has(current.id)) {
      visited.add(current.id);
      if (allLeadIds.has(current.parentID)) { belowLead.add(session.id); break; }
      const parent = sessionById.get(current.parentID);
      if (!parent) break;
      current = parent;
    }
  }
  const projectIds: (string | null)[] = [...sectionById.keys(), null];
  for (const projectId of projectIds) {
    if (args.singleProjectMode && projectId !== args.singleProjectId) continue;
    const sessions = all.filter((session) => {
      const ownerId = args.sessionOwnerById.get(session.id)?.projectId;
      return projectId === null ? !ownerId || !sectionById.has(ownerId) : ownerId === projectId;
    });
    const projectDrafts = drafts.filter((draft) => projectId === null ? !draft.projectId || !sectionById.has(draft.projectId) : draft.projectId === projectId);
    if (sessions.length === 0 && projectDrafts.length === 0) continue;
    if (search && !sessions.some((session) => containsMatch(nodeFor(session)))) continue;
    if (projectId) {
      const section = sectionById.get(projectId);
      if (!section) continue;
      rows.push({ kind: 'project-header', key: key('project', projectId), estimateSize: 40, section,
        collapsed: !search && !args.singleProjectMode && args.collapsedProjects.has(projectId), forceExpanded: search });
      if (!search && !args.singleProjectMode && args.collapsedProjects.has(projectId)) continue;
    }
    const lanes = sessions.filter((session) => allLeadIds.has(session.id));
    const laneWorkspace = new Map<string, string>();
    for (const session of sessions) {
      const workspace = workspaceProjection(options.dispatchAttribution, options.source, session.directory);
      if (workspace.status === 'known' && !conflictingDirectories.has(session.directory)) laneWorkspace.set(session.directory, workspace.context.lane);
    }
    for (const lead of lanes) {
      if (!conflictingDirectories.has(lead.directory) && lanes.filter((other) => other.directory === lead.directory).length === 1) {
        const lane = locationAnnotations(lead)?.laneLead;
        if (lane) laneWorkspace.set(lead.directory, lane);
      }
    }
    const topologyDirectories = args.authoritativeSections.find((section) => section.project.id === projectId)?.groups
      .flatMap((group) => group.directory ? [group.directory] : []) ?? [];
    const workspaceDirectories = [...new Set([...topologyDirectories,
      ...sessions.map((session) => session.directory).filter(Boolean).sort(), ...projectDrafts.map((draft) => draft.directory)])];
    const activity = new Map<string, number>();
    for (const session of sessions) activity.set(session.directory, Math.max(activity.get(session.directory) ?? 0, session.time.updated));
    const order = new Map(options.manualOrder.map((directory, index) => [directory, index]));
    workspaceDirectories.sort((left, right) => options.workspaceOrder === 'a-z' ? left.localeCompare(right)
      : options.workspaceOrder === 'recent' ? (activity.get(right) ?? 0) - (activity.get(left) ?? 0)
        : (order.get(key('workspace', left)) ?? Number.MAX_SAFE_INTEGER) - (order.get(key('workspace', right)) ?? Number.MAX_SAFE_INTEGER));

    const appendWorkspace = (directory: string, depth: number) => {
      const members = sessions.filter((session) => session.directory === directory && !allLeadIds.has(session.id) && !belowLead.has(session.id));
      if (search && !members.some((session) => containsMatch(nodeFor(session))) && !lanes.some((lead) => lead.directory === directory && matches(lead))) return;
      const siblings = workspaceDirectories.filter((path) => laneWorkspace.get(path) === laneWorkspace.get(directory));
      const previous = siblings[siblings.indexOf(directory) - 1];
      const expanded = group('workspace', directory, directory, directory, depth, projectId, undefined, previous ? key('workspace', previous) : undefined);
      const workspaceRow = rows[rows.length - 1];
      if (workspaceRow.kind === 'location-group') workspaceRow.workspaceSiblingKeys = siblings.map((path) => key('workspace', path));
      if (!expanded) return;
      const roots = members.filter((session) => {
        if (!session.parentID || !sessionById.has(session.parentID)) return true;
        const path: string[] = [];
        let current: Session | undefined = session;
        while (current && !path.includes(current.id)) {
          path.push(current.id);
          current = sessionById.get(current.parentID ?? '');
        }
        return current?.id === session.id && session.id === [...path].sort()[0];
      });
      const open = roots.filter((session) => locationAnnotations(session)?.finished !== true);
      const finished = roots.filter((session) => locationAnnotations(session)?.finished === true);
      for (const session of open) appendSession(session, depth + 1, projectId);
      if (finished.length && group('finished', directory, '', directory, depth + 1, projectId)) {
        for (const session of finished) appendSession(session, depth + 2, projectId);
      }
      for (const draft of projectDrafts.filter((entry) => entry.directory === directory)) {
        rows.push({ kind: 'draft', key: key('draft', draft.id), estimateSize: 34, draft, depth: depth + 1,
          projectId, mixed: false, detailed: false });
      }
    };
    const laneNames = [...new Set([...lanes.flatMap((lead) => locationAnnotations(lead)?.laneLead ?? []), ...laneWorkspace.values()])];
    for (const lane of laneNames) {
      const lead = lanes.find((entry) => locationAnnotations(entry)?.laneLead === lane);
      const directories = workspaceDirectories.filter((directory) => laneWorkspace.get(directory) === lane);
      if (search && !(lead && containsMatch(nodeFor(lead))) && !sessions.some((session) => directories.includes(session.directory) && containsMatch(nodeFor(session)))) continue;
      const finishedLead = lead !== undefined && locationAnnotations(lead)?.finished === true;
      if (lead && finishedLead && !group('finished', `lead:${lead.id}`, '', lead.directory, 0, projectId)) continue;
      const laneDepth = finishedLead ? 1 : 0;
      const expanded = group('lane', lead?.id ?? `dispatch:${JSON.stringify([projectId, lane])}`, lane, lead?.directory ?? null, laneDepth, projectId, lead);
      if (!expanded) continue;
      const directChildren = lead ? children.get(lead.id) ?? [] : [];
      for (const child of directChildren.filter((entry) => locationAnnotations(entry)?.finished !== true)) {
        if (!allLeadIds.has(child.id)) appendSession(child, laneDepth + 1, projectId);
      }
      const finishedChildren = directChildren.filter((entry) => !allLeadIds.has(entry.id) && locationAnnotations(entry)?.finished === true);
      if (lead && finishedChildren.length && group('finished', `lane:${lead.id}`, '', lead.directory, laneDepth + 1, projectId)) {
        for (const child of finishedChildren) appendSession(child, laneDepth + 2, projectId);
      }
      for (const directory of directories) appendWorkspace(directory, laneDepth + 1);
    }
    for (const directory of workspaceDirectories) if (!laneWorkspace.has(directory)) appendWorkspace(directory, 0);
  }
  if (!rows.length) rows.push({ kind: 'empty', key: key('empty', query), estimateSize: 40, emptyKind: search ? 'search' : 'sidebar' });
  return { rows, selectionEntries, selectionDescendantIds, rowIndexByKey: new Map(rows.map((row, index) => [row.key, index])),
    stickyHeaders: rows.flatMap((row, index) => row.kind === 'project-header' ? [{ rowIndex: index, kind: 'project' as const, id: row.section.project.id }] : []),
    folderDropTargets: [], folderAuthorityByOwner: args.folderAuthorityByOwner, sessionById, folderOwnerKeyBySessionId,
    searchMatchCount: search ? all.filter(matches).length : 0 };
}

export function locationLeadSessionRow(row: CanonicalLocationGroup): Extract<SessionSidebarRow, { kind: 'session' }> | null {
  if (!row.lead) return null;
  return { kind: 'session', key: row.key, estimateSize: 54, node: row.lead, depth: row.depth,
    ownsWork: false, projectId: row.projectId, ownerProjectId: row.projectId, groupDirectory: row.lead.session.directory,
    ownerKey: null, selectionScopeKey: null, archived: isSessionArchived(row.lead.session),
    renderContext: 'project', secondaryMeta: null };
}
