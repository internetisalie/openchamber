import type { Project as OpenCodeProject } from '@/lib/opencode/model';
import type { WorktreeMetadata } from '@/types/worktree';
import { normalizePath } from '../utils';

type ConfiguredProject = { path: string };

export const buildOpenCodeWorkspaceDirectoriesByProject = (
  projects: ConfiguredProject[],
  openCodeProjects: OpenCodeProject[],
): Map<string, string[]> => {
  const configuredProjectOrder = new Map<string, number>();
  projects.forEach((project, index) => {
    const projectPath = normalizePath(project.path);
    if (projectPath && !configuredProjectOrder.has(projectPath)) {
      configuredProjectOrder.set(projectPath, index);
    }
  });

  const result = new Map<string, string[]>();
  for (const openCodeProject of openCodeProjects) {
    const normalizedWorktree = normalizePath(openCodeProject.worktree);
    const workspaceDirectories = new Set<string>();
    if (normalizedWorktree) {
      workspaceDirectories.add(normalizedWorktree);
    }
    for (const sandbox of openCodeProject.sandboxes ?? []) {
      const normalizedSandbox = normalizePath(sandbox);
      if (normalizedSandbox) {
        workspaceDirectories.add(normalizedSandbox);
      }
    }

    const configuredMembers = [...workspaceDirectories]
      .filter((directory) => configuredProjectOrder.has(directory))
      .sort((left, right) => (
        (configuredProjectOrder.get(left) ?? 0) - (configuredProjectOrder.get(right) ?? 0)
      ));
    if (configuredMembers.length === 0) continue;

    const owner = normalizedWorktree && configuredProjectOrder.has(normalizedWorktree)
      ? normalizedWorktree
      : configuredMembers[0];
    if (!owner) continue;

    const ownedDirectories = [...workspaceDirectories].filter((directory) => (
      directory !== owner && !configuredProjectOrder.has(directory)
    ));
    if (ownedDirectories.length === 0) continue;

    const existing = result.get(owner) ?? [];
    result.set(owner, [...new Set([...existing, ...ownedDirectories])]);
  }
  return result;
};

export const buildKnownSessionDirectories = (
  projects: ConfiguredProject[],
  availableWorktreesByProject: Map<string, WorktreeMetadata[]>,
  options?: {
    includeWorktrees?: boolean;
    workspaceDirectoriesByProject?: ReadonlyMap<string, readonly string[]>;
  },
): Set<string> => {
  const directories = new Set<string>();
  const addDirectory = (directory: string): void => {
    const normalizedDirectory = normalizePath(directory);
    if (normalizedDirectory) {
      directories.add(normalizedDirectory);
    }
  };

  for (const project of projects) {
    addDirectory(project.path);
  }
  if (options?.includeWorktrees === false) {
    return directories;
  }
  for (const worktrees of availableWorktreesByProject.values()) {
    for (const worktree of worktrees) {
      addDirectory(worktree.path);
    }
  }
  for (const workspaceDirectories of options?.workspaceDirectoriesByProject?.values() ?? []) {
    for (const directory of workspaceDirectories) {
      addDirectory(directory);
    }
  }
  return directories;
};
