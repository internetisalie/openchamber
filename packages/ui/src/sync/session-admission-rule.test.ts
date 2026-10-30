import { describe, expect, test } from 'bun:test';
import type { ProjectEntry } from '@/lib/api/types';
import type { WorktreeMetadata } from '@/types/worktree';
import {
  getSessionAdmissionDirectories,
  isGlobalSessionTarget,
  isSessionDirectoryAdmitted,
  isSessionTargetAdmitted,
  type SessionAdmissionRecord,
  type SessionAdmissionScope,
} from './session-admission-rule';

const projects: ProjectEntry[] = [{ id: 'kept', path: '/kept' }];
const worktrees = new Map<string, WorktreeMetadata[]>();
const globalSession: SessionAdmissionRecord = { projectID: 'global', directory: '/outside' };
const scopes: SessionAdmissionScope[] = ['full-app', 'capacitor', 'vscode'];

describe('session target admission policy', () => {
  test('explicit archive classification changes ownership without granting a Global directory exception', () => {
    const target = { directory: '/outside', session: globalSession };
    const classification = { chatsRoot: null, spaceArchives: new Map([['/outside', {
      spaceId: '012345abcdef', name: 'Archived space', directory: '/outside',
    }]]) };
    expect(isGlobalSessionTarget(target, 'full-app', classification)).toBe(false);
    expect(isSessionTargetAdmitted(target, projects, worktrees, 'full-app', undefined, classification)).toBe(true);
    expect(isSessionTargetAdmitted({ directory: '/ordinary-outside' }, projects, worktrees, 'full-app', undefined, classification)).toBe(false);
  });

  test('secondary workspace authority requires a configured project member and stays out of VS Code', () => {
    const catalog = [
      { id: 'kept', worktree: '/kept', sandboxes: ['/secondary'], time: { created: 1, updated: 1 } },
      { id: 'unconfigured', worktree: '/elsewhere', sandboxes: ['/unregistered'], time: { created: 1, updated: 1 } },
    ];
    const full = getSessionAdmissionDirectories(projects, worktrees, 'full-app', catalog);
    expect([...full]).toEqual(['/kept', '/secondary']);
    expect(isSessionTargetAdmitted({ directory: '/secondary/ai' }, projects, worktrees, 'full-app', full)).toBe(true);
    expect(isSessionTargetAdmitted({ directory: '/unregistered' }, projects, worktrees, 'full-app', full)).toBe(false);
    expect([...getSessionAdmissionDirectories(projects, worktrees, 'vscode', catalog)]).toEqual(['/kept']);
  });

  test('authoritative secondary roots admit their descendants while VS Code stays exact-scoped', () => {
    const roots = new Set(['/Secondary']);
    expect(isSessionTargetAdmitted({ directory: '/Secondary/ai' }, [], worktrees, 'full-app', roots)).toBe(true);
    expect(isSessionTargetAdmitted({ directory: '/Secondary-other' }, [], worktrees, 'full-app', roots)).toBe(false);
    expect(isSessionTargetAdmitted({ directory: '/secondary' }, [], worktrees, 'full-app', roots)).toBe(false);
    expect(isSessionTargetAdmitted({ directory: '/secondary' }, [], worktrees, 'vscode', roots)).toBe(true);
    expect(isSessionTargetAdmitted({ directory: '/Secondary/ai' }, [{ id: 'secondary', path: '/Secondary' }], worktrees, 'vscode', roots)).toBe(false);
  });

  test('admits an authoritative Global record without registering its directory', () => {
    const target = { directory: '/outside', session: globalSession };
    expect(isGlobalSessionTarget(target, 'full-app')).toBe(true);
    expect(isSessionTargetAdmitted(target, projects, worktrees, 'full-app')).toBe(true);
    expect(isSessionDirectoryAdmitted('/outside', projects, worktrees)).toBe(false);
    expect(isSessionTargetAdmitted({ directory: '/outside' }, projects, worktrees, 'full-app')).toBe(false);
    expect(isSessionTargetAdmitted({
      directory: '/outside', session: { ...globalSession, projectID: 'ordinary' },
    }, projects, worktrees, 'full-app')).toBe(false);
    expect(projects).toEqual([{ id: 'kept', path: '/kept' }]);
    expect(worktrees.size).toBe(0);
  });

  test('never infers Global identity from an unregistered path or a missing project', () => {
    for (const directory of ['/outside', '/global', '/', '/kept-other']) {
      expect(isSessionTargetAdmitted({
        directory, session: { projectID: '', directory },
      }, projects, worktrees, 'full-app')).toBe(false);
      expect(isSessionTargetAdmitted({ directory }, projects, worktrees, 'full-app')).toBe(false);
    }
  });

  test('cannot transfer a Global record to another destination', () => {
    for (const directory of ['/different', '/outside/child', '/OUTSIDE', '', null, undefined]) {
      const target = { directory, session: globalSession };
      expect(isGlobalSessionTarget(target, 'full-app')).toBe(false);
      expect(isSessionTargetAdmitted(target, projects, worktrees, 'full-app')).toBe(false);
    }
    expect(isGlobalSessionTarget({ directory: '/outside/', session: globalSession }, 'full-app')).toBe(true);
  });

  test('Capacitor and VS Code retain ordinary admission without the hosted Global exception', () => {
    for (const scope of ['capacitor', 'vscode'] as const) {
      const target = { directory: '/outside', session: globalSession };
      expect(isGlobalSessionTarget(target, scope)).toBe(false);
      expect(isSessionTargetAdmitted(target, projects, worktrees, scope)).toBe(false);
      expect(isSessionTargetAdmitted({
        directory: '/kept/sub', session: { projectID: 'global', directory: '/kept/sub' },
      }, projects, worktrees, scope)).toBe(true);
    }
  });

  test('preserves ordinary project boundaries and live-space admission in every scope', () => {
    for (const scope of scopes) {
      expect(isSessionTargetAdmitted({ directory: '/kept/sub' }, projects, worktrees, scope)).toBe(true);
      expect(isSessionTargetAdmitted({ directory: '/kept-other' }, projects, worktrees, scope)).toBe(false);
      expect(isSessionTargetAdmitted({ directory: '/spaces/012345abcdef/project' }, projects, worktrees, scope)).toBe(true);
      expect(isGlobalSessionTarget({
        directory: '/spaces/012345abcdef/project',
        session: { projectID: 'global', directory: '/spaces/012345abcdef/project' },
      }, scope)).toBe(false);
    }
  });

  test('retains linked-worktree descendants without admitting neighboring paths', () => {
    const linked = new Map<string, WorktreeMetadata[]>([['/kept', [{
      path: '/linked', projectDirectory: '/kept', branch: 'task', label: 'task',
    }]]]);
    for (const scope of scopes) {
      expect(isSessionTargetAdmitted({ directory: '/linked/sub' }, projects, linked, scope)).toBe(true);
      expect(isSessionTargetAdmitted({ directory: '/linked-other' }, projects, linked, scope)).toBe(false);
    }
  });
});
