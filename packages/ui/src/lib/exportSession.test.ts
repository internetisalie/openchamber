import { describe, expect, test } from 'bun:test';
import type { Session } from '@opencode-ai/sdk/v2';
import { collectChildSessionExports } from './exportSession';

const session = (id: string, directory: string): Session => ({
  id,
  slug: id,
  projectID: 'global',
  directory,
  title: id,
  version: '1',
  time: { created: 1, updated: 1 },
});

describe('collectChildSessionExports', () => {
  test('loads every descendant from its authoritative returned directory', async () => {
    const loads: Array<{ directory: string; sessionID: string }> = [];
    const result = await collectChildSessionExports({
      children: [{
        session: session('child', '/global-child-source'),
        children: [{
          session: session('grandchild', '/global-grandchild-source'),
          children: [],
        }],
      }],
      fallbackDirectory: '/root-source',
      loadRecords: async (input) => {
        loads.push(input);
        return [];
      },
      untitledSubagentTitle: 'Untitled subagent',
    });

    expect(loads).toEqual([
      { directory: '/global-child-source', sessionID: 'child' },
      { directory: '/global-grandchild-source', sessionID: 'grandchild' },
    ]);
    expect(result.children[0]?.children[0]?.title).toBe('grandchild');
    expect(result.skipped).toBe(0);
  });
});
