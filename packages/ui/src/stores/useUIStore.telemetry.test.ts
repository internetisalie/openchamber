import { afterEach, describe, expect, test } from 'bun:test';
import { useUIStore } from './useUIStore';

const originalOptions = useUIStore.persist.getOptions();
const originalState = useUIStore.getState();
type PersistedUI = Parameters<NonNullable<typeof originalOptions.storage>['setItem']>[1];
afterEach(() => {
  useUIStore.persist.setOptions(originalOptions);
  useUIStore.setState(originalState, true);
});

describe('telemetry settings migration', () => {
  test('shows telemetry by default', () => {
    expect(useUIStore.getInitialState().workStatusHiddenSections).toEqual([]);
  });

  for (const version of [18, 19, 20]) {
    test(`migrates real v${version} hydration without losing existing hidden sections`, async () => {
      const writes: PersistedUI[] = [];
      useUIStore.persist.setOptions({ storage: {
        getItem: () => ({ version, state: { workStatusHiddenSections: ['mcp', 'telemetry'] } }),
        setItem: (_name, value) => { writes.push(value); },
        removeItem: () => undefined,
      } });
      await useUIStore.persist.rehydrate();
      expect(useUIStore.getState().workStatusHiddenSections).toEqual(['mcp']);
      expect(useUIStore.getState().workStatusHiddenSectionsExplicit).toBe(false);
      expect(writes).toHaveLength(1);
      expect(writes[0]).toMatchObject({
        version: 31,
        state: { workStatusHiddenSections: ['mcp'], workStatusHiddenSectionsExplicit: false },
      });
    });
  }

  test('preserves an explicitly hidden section from v20', async () => {
    const writes: PersistedUI[] = [];
    useUIStore.persist.setOptions({ storage: {
      getItem: () => ({ version: 20, state: { workStatusHiddenSections: ['mcp', 'telemetry'], workStatusHiddenSectionsExplicit: true } }),
      setItem: (_name, value) => { writes.push(value); },
      removeItem: () => undefined,
    } });
    await useUIStore.persist.rehydrate();
    expect(useUIStore.getState().workStatusHiddenSections).toEqual(['mcp', 'telemetry']);
    expect(useUIStore.getState().workStatusHiddenSectionsExplicit).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      version: 31,
      state: { workStatusHiddenSections: ['mcp', 'telemetry'], workStatusHiddenSectionsExplicit: true },
    });
  });

  test('migrates a v26 arrangement to v31: Agent PTYs and Tasks join after Subagents, the phone list is kept', async () => {
    const writes: PersistedUI[] = [];
    const arranged = ['mcp', 'session', 'repository', 'usage', 'subagents', 'telemetry', 'contextSources', 'workflows', 'pinned'];
    useUIStore.persist.setOptions({ storage: {
      getItem: () => ({ version: 26, state: {
        workStatusSectionOrder: arranged,
        workStatusSectionOrderExplicit: true,
        workStatusHiddenSections: ['mcp'],
        workStatusHiddenSectionsExplicit: true,
        mobileWorkStatusHiddenSections: ['mcp', 'subagents'],
      } }),
      setItem: (_name, value) => { writes.push(value); },
      removeItem: () => undefined,
    } });
    await useUIStore.persist.rehydrate();
    const expected = ['mcp', 'session', 'repository', 'usage', 'subagents', 'ptys', 'tasks', 'telemetry', 'contextSources', 'workflows', 'pinned'];
    expect(useUIStore.getState().workStatusSectionOrder).toEqual(expected);
    expect(useUIStore.getState().workStatusHiddenSections).toEqual(['mcp']);
    expect(useUIStore.getState().mobileWorkStatusHiddenSections).toEqual(['mcp', 'subagents']);
    expect(writes.at(-1)).toMatchObject({
      version: 31,
      state: { workStatusSectionOrder: expected, mobileWorkStatusHiddenSections: ['mcp', 'subagents'] },
    });
  });

  test('a v26 state with no phone list starts the phone with Subagents hidden and no Usage or Agent PTYs entry', async () => {
    useUIStore.persist.setOptions({ storage: {
      getItem: () => ({ version: 26, state: { workStatusHiddenSections: [], workStatusHiddenSectionsExplicit: true } }),
      setItem: () => undefined,
      removeItem: () => undefined,
    } });
    await useUIStore.persist.rehydrate();
    expect(useUIStore.getState().mobileWorkStatusHiddenSections).toEqual(['subagents']);
    expect(useUIStore.getState().mobileWorkStatusHiddenSections).not.toContain('ptys');
    expect(useUIStore.getState().workStatusHiddenSections).not.toContain('ptys');
  });

  test('explicit hiding round-trips through the actual persisted projection and hydration', async () => {
    let saved: PersistedUI = { state: useUIStore.getInitialState(), version: originalOptions.version };
    useUIStore.persist.setOptions({ storage: {
      getItem: () => saved,
      setItem: (_name, value) => { saved = value; },
      removeItem: () => undefined,
    } });
    useUIStore.setState({ workStatusHiddenSections: ['mcp'], workStatusHiddenSectionsExplicit: false });
    useUIStore.getState().setWorkStatusSectionVisible('telemetry', false);
    useUIStore.persist.setOptions({ storage: { getItem: () => saved, setItem: () => undefined, removeItem: () => undefined } });
    useUIStore.setState({ workStatusHiddenSections: [], workStatusHiddenSectionsExplicit: false });
    await useUIStore.persist.rehydrate();
    expect(useUIStore.getState().workStatusHiddenSections).toEqual(['mcp', 'telemetry']);
    expect(useUIStore.getState().workStatusHiddenSectionsExplicit).toBe(true);
  });

  test('can show telemetry again after hiding it', () => {
    useUIStore.setState({ workStatusHiddenSections: ['mcp', 'telemetry'], workStatusHiddenSectionsExplicit: true });
    useUIStore.getState().setWorkStatusSectionVisible('telemetry', true);
    expect(useUIStore.getState().workStatusHiddenSections).toEqual(['mcp']);
    expect(useUIStore.getState().workStatusHiddenSectionsExplicit).toBe(true);
  });
});
