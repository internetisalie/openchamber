import { describe, expect, test } from 'bun:test';
import { isZoneMountedContextSurface, type ContextPanelMode } from './modes';

describe('context surface mount ownership', () => {
  test('Agent PTYs mounts in the selected zone', () => {
    expect(isZoneMountedContextSurface('agent-pty')).toBe(true);
  });

  test('existing zone-rendered surfaces retain their mount owner', () => {
    const modes: ContextPanelMode[] = ['context', 'git', 'pr', 'notes'];
    for (const mode of modes) expect(isZoneMountedContextSurface(mode)).toBe(true);
  });

  test('retained panes and chat do not mount through the zone fallback', () => {
    const modes: ContextPanelMode[] = ['file', 'diff', 'walkthrough', 'terminal', 'browser', 'chat', 'plugin:agent-memory'];
    for (const mode of modes) expect(isZoneMountedContextSurface(mode)).toBe(false);
  });
});
