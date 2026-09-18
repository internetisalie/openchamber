import { describe, expect, test } from 'bun:test';
import type { Project } from '@opencode-ai/sdk/v2/client';
import {
  buildKnownSessionDirectories,
  buildOpenCodeWorkspaceDirectoriesByProject,
} from './sessionListDirectories';

describe('buildKnownSessionDirectories', () => {
  test('normalizes project roots and optionally includes worktrees', () => {
    const worktrees = new Map([
      ['/repo', [{ path: '/repo/worktree', projectDirectory: '/repo', branch: 'worktree', label: 'worktree' }]],
    ]);

    expect([...buildKnownSessionDirectories([{ path: '/Repo' }], worktrees)]).toEqual([
      '/repo',
      '/repo/worktree',
    ]);
    expect([...buildKnownSessionDirectories([{ path: '/Repo' }], worktrees, { includeWorktrees: false })]).toEqual([
      '/repo',
    ]);
  });

  test('includes OpenCode project sandboxes that are not Git worktrees', () => {
    const configuredProjects = [
      { path: '/repo' },
      { path: '/repo/configured-sandbox' },
    ];
    const workspaceDirectories = buildOpenCodeWorkspaceDirectoriesByProject(configuredProjects, [{
      id: 'project',
      worktree: '/repo',
      sandboxes: [
        '/repo/linked-worktree',
        '/repo/independent-sandbox',
        '/repo/configured-sandbox',
      ],
      time: { created: 1, updated: 1, initialized: 1 },
    } satisfies Project]);

    expect(workspaceDirectories).toEqual(new Map([['/repo', [
      '/repo/linked-worktree',
      '/repo/independent-sandbox',
    ]]]));
    expect([...buildKnownSessionDirectories(configuredProjects, new Map(), {
      workspaceDirectoriesByProject: workspaceDirectories,
    })]).toEqual([
      '/repo',
      '/repo/configured-sandbox',
      '/repo/linked-worktree',
      '/repo/independent-sandbox',
    ]);
  });
});
