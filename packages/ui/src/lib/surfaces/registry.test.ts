import { describe, expect, test } from 'bun:test';

import {
  CONTEXT_SURFACES,
  getVisibleContextRailSurfaces,
  WALKTHROUGH_MIN_WIDTH,
} from './registry';

const baseOptions = {
  railOrder: [],
  isVSCode: false,
  screenWidth: 1200,
  tabs: [],
  sourceControlConnected: true,
  workflowsShown: false,
} as const;

describe('getVisibleContextRailSurfaces', () => {
  test('restores Agent PTYs immediately below Terminals, including old saved orders', () => {
    for (const railOrder of [[], CONTEXT_SURFACES.filter((surface) => surface.id !== 'agent-pty').map((surface) => surface.id)]) {
      const ids = getVisibleContextRailSurfaces({ ...baseOptions, railOrder }).map((surface) => surface.id);
      expect(ids.indexOf('agent-pty')).toBe(ids.indexOf('terminal') + 1);
    }
    expect(getVisibleContextRailSurfaces({ ...baseOptions, isVSCode: true }).some((surface) => surface.id === 'agent-pty')).toBe(false);
    expect(getVisibleContextRailSurfaces({ ...baseOptions, hiddenSurfaces: ['agent-pty'] }).some((surface) => surface.id === 'agent-pty')).toBe(false);
  });

  test('retains explicit Agent PTYs order within tools while keeping rail groups together', () => {
    const ids = getVisibleContextRailSurfaces({ ...baseOptions, railOrder: ['agent-pty', 'context', 'terminal'] }).map((surface) => surface.id);
    expect(ids).toEqual([
      'agent-pty', 'terminal', 'editor', 'browser',
      'context',
      'git', 'pr', 'diff', 'walkthrough',
      'notes',
    ]);
    const reordered = getVisibleContextRailSurfaces({ ...baseOptions, railOrder: ['context', 'browser', 'agent-pty', 'terminal', 'editor'] }).map((surface) => surface.id);
    expect(reordered).toEqual([
      'context',
      'browser', 'agent-pty', 'terminal', 'editor',
      'git', 'pr', 'diff', 'walkthrough',
      'notes',
    ]);
  });

  test('hides the walkthrough on VS Code and below the min width', () => {
    expect(getVisibleContextRailSurfaces({ ...baseOptions, isVSCode: true }).some((s) => s.id === 'walkthrough')).toBe(false);
    expect(
      getVisibleContextRailSurfaces({ ...baseOptions, screenWidth: WALKTHROUGH_MIN_WIDTH - 1 }).some((s) => s.id === 'walkthrough'),
    ).toBe(false);
    expect(
      getVisibleContextRailSurfaces({ ...baseOptions, screenWidth: WALKTHROUGH_MIN_WIDTH }).some((s) => s.id === 'walkthrough'),
    ).toBe(true);
  });

  test('offers no browser surface inside VS Code', () => {
    expect(getVisibleContextRailSurfaces(baseOptions).some((s) => s.id === 'browser')).toBe(true);
    // Nothing that makes the panel worth having works there, so offering it
    // would promise the panel people see on the desktop.
    expect(getVisibleContextRailSurfaces({ ...baseOptions, isVSCode: true }).some((s) => s.id === 'browser')).toBe(false);
  });

  test('hides content-driven surfaces until a matching tab exists', () => {
    const chat = CONTEXT_SURFACES.find((surface) => surface.id === 'chat');
    if (!chat) {
      throw new Error('chat surface missing from registry');
    }
    expect(chat.availability).toBe('has-content');
    expect(getVisibleContextRailSurfaces(baseOptions).some((s) => s.id === 'chat')).toBe(false);
    expect(getVisibleContextRailSurfaces({ ...baseOptions, tabs: [{ mode: chat.mode }] }).some((s) => s.id === 'chat')).toBe(true);
  });

  test('the browser surface can be opened from the rail with no tab yet', () => {
    const browser = CONTEXT_SURFACES.find((surface) => surface.id === 'browser');
    expect(browser?.availability).toBe('always');
    expect(getVisibleContextRailSurfaces(baseOptions).some((s) => s.id === 'browser')).toBe(true);
  });

  test('respects the persisted user rail order inside each group', () => {
    const surfaces = getVisibleContextRailSurfaces({ ...baseOptions, railOrder: ['diff', 'git', 'context'] });
    expect(surfaces.slice(0, 2).map((surface) => surface.id)).toEqual(['diff', 'git']);
  });

  test('keeps each group together, placed where its first surface stands', () => {
    // A saved order from before groups: Notes ahead of Files, Context last.
    const surfaces = getVisibleContextRailSurfaces({
      ...baseOptions,
      railOrder: ['notes', 'git', 'editor', 'pr', 'terminal', 'context'],
    });
    expect(surfaces.map((surface) => surface.id)).toEqual([
      'notes',
      'git', 'pr', 'diff', 'walkthrough',
      'editor', 'terminal', 'agent-pty', 'browser',
      'context',
    ]);
  });

  test('hides the Tracker until a repository host is connected or an item is open in it', () => {
    expect(getVisibleContextRailSurfaces({ ...baseOptions, sourceControlConnected: false }).some((s) => s.id === 'pr')).toBe(false);
    expect(getVisibleContextRailSurfaces({ ...baseOptions, sourceControlConnected: true }).some((s) => s.id === 'pr')).toBe(true);
    const tabs: { mode: 'pr'; targetPath: string }[] = [{ mode: 'pr', targetPath: 'https://linear.app/acme/issue/ENG-7' }];
    expect(getVisibleContextRailSurfaces({ ...baseOptions, sourceControlConnected: false, tabs }).some((s) => s.id === 'pr')).toBe(true);
  });

  test('offers Workflows only while the caller says so, and never in VS Code', () => {
    expect(getVisibleContextRailSurfaces(baseOptions).some((s) => s.id === 'workflows')).toBe(false);
    expect(getVisibleContextRailSurfaces({ ...baseOptions, workflowsShown: true }).some((s) => s.id === 'workflows')).toBe(true);
    expect(getVisibleContextRailSurfaces({ ...baseOptions, workflowsShown: true, isVSCode: true }).some((s) => s.id === 'workflows')).toBe(false);
  });

  test('appends installed guest panels except on VS Code', () => {
    const hello = {
      id: 'plugin:hello' as const,
      mode: 'plugin:hello' as const,
      icon: 'window' as const,
      label: 'Hello',
      labelKey: 'contextRail.surface.plugin' as const,
      descriptionKey: 'contextRail.surface.plugin.description' as const,
      availability: 'always' as const,
    };
    expect(getVisibleContextRailSurfaces({ ...baseOptions, extras: [hello] }).some((s) => s.id === 'plugin:hello')).toBe(true);
    expect(getVisibleContextRailSurfaces({ ...baseOptions, extras: [hello], isVSCode: true }).some((s) => s.id === 'plugin:hello')).toBe(false);
  });
});
