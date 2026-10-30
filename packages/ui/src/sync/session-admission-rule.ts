import type { ProjectEntry } from '@/lib/api/types';
import type { WorktreeMetadata } from '@/types/worktree';
import { isChatDirectoryPath } from '@/lib/chatDirectories';
import { normalizePath } from '@/lib/pathNormalization';
import { resolveProjectForSessionDirectory } from '@/lib/projectResolution';
import { isSpaceDirectory } from '@/lib/spaces/space-route';
import { isSpaceArchiveDirectory } from '@/lib/spaces/space-archives';
import type { Project, Session } from '@/lib/opencode/model';
import { buildKnownSessionDirectories, buildOpenCodeWorkspaceDirectoriesByProject } from '@/components/session/sidebar/list/sessionListDirectories';
import { isVSCodeRuntime } from '@/lib/desktop';
import { isCapacitorApp } from '@/lib/platform';
import type { SpaceArchive } from '@/lib/spaces/spaces-api';

export type SessionAdmissionScope = 'full-app' | 'capacitor' | 'vscode';
export type SessionAdmissionRecord = Pick<Session, 'projectID' | 'directory'>;
export type SessionAdmissionClassification = {
  chatsRoot: string | null;
  spaceArchives: ReadonlyMap<string, SpaceArchive> | null;
};
type SessionAdmissionTarget = {
  directory: string | null | undefined;
  /** An authoritative session record, never a directory-derived project identity. */
  session?: SessionAdmissionRecord | null;
};

export const getSessionAdmissionScope = (): SessionAdmissionScope => (
  isVSCodeRuntime() ? 'vscode' : isCapacitorApp() ? 'capacitor' : 'full-app'
);

export const getSessionAdmissionDirectories = (
  projects: ProjectEntry[],
  worktrees: Map<string, WorktreeMetadata[]>,
  scope: SessionAdmissionScope,
  openCodeProjects: Project[],
): Set<string> => buildKnownSessionDirectories(projects, worktrees, {
  includeWorktrees: scope !== 'vscode',
  workspaceDirectoriesByProject: scope === 'vscode' ? undefined : buildOpenCodeWorkspaceDirectoriesByProject(projects, openCodeProjects),
});

export const isSessionChatDirectory = (directory: string | null | undefined, classification?: SessionAdmissionClassification): boolean => (
  (classification === undefined || classification.chatsRoot !== null) && isChatDirectoryPath(directory)
);

const isArchivedSpaceDirectory = (directory: string | null, classification?: SessionAdmissionClassification): boolean => (
  classification === undefined ? isSpaceArchiveDirectory(directory) : directory !== null && (classification.spaceArchives?.has(directory) ?? false)
);

/** Global visibility belongs to this record and destination, only on full-app surfaces. */
export const isGlobalSessionTarget = (target: SessionAdmissionTarget, scope: SessionAdmissionScope, classification?: SessionAdmissionClassification): boolean => {
  const directory = normalizePath(target.directory);
  return scope === 'full-app' && Boolean(directory)
    && target.session?.projectID === 'global'
    && normalizePath(target.session.directory) === directory
    && !isSessionChatDirectory(directory, classification)
    && !isSpaceDirectory(directory)
    && !isArchivedSpaceDirectory(directory, classification);
};

/** A host destination becomes visible only after trust and project registration. */
export const isSessionDirectoryAdmitted = (
  directory: string | null | undefined,
  projects: ProjectEntry[],
  worktrees: Map<string, WorktreeMetadata[]>,
  classification?: SessionAdmissionClassification,
): boolean => {
  const normalized = normalizePath(directory);
  if (!normalized) return false;
  return isSessionChatDirectory(normalized, classification) || isSpaceDirectory(normalized) || isArchivedSpaceDirectory(normalized, classification)
    || resolveProjectForSessionDirectory(projects, worktrees, normalized) !== null;
};

/** Shared navigation and projection policy; Global never grants authority to a whole directory. */
export const isSessionTargetAdmitted = (
  target: SessionAdmissionTarget,
  projects: ProjectEntry[],
  worktrees: Map<string, WorktreeMetadata[]>,
  scope: SessionAdmissionScope,
  /** Authoritative project/workspace roots; VS Code uses exact workspace scope. */
  knownDirectories?: ReadonlySet<string>,
  classification?: SessionAdmissionClassification,
): boolean => {
  if (isGlobalSessionTarget(target, scope, classification)) return true;
  const directory = normalizePath(target.directory);
  if (!directory) return false;
  if (knownDirectories) {
    const key = scope === 'vscode' ? directory.toLowerCase() : directory;
    for (const root of knownDirectories) {
      const normalized = normalizePath(root);
      if (!normalized) continue;
      const rootKey = scope === 'vscode' ? normalized.toLowerCase() : normalized;
      if (key === rootKey || (scope !== 'vscode' && key.startsWith(rootKey.endsWith('/') ? rootKey : `${rootKey}/`))) return true;
    }
    if (scope === 'vscode') return isSessionChatDirectory(directory, classification);
  }
  return isSessionDirectoryAdmitted(directory, projects, worktrees, classification);
};
