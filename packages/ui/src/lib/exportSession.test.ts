import { describe, expect, test } from 'bun:test';
import type { Message, Part, Session } from '@/lib/opencode/model';
import { createContextPart } from '@/lib/messages/contextParts';
import { collectChildSessionExports, formatSessionAsMarkdown } from './exportSession';

const text = (messageID: string, content: string): Part => ({
  id: `${messageID}-text`, sessionID: 'session', messageID, type: 'text', text: content,
});

type SessionRecord = { info: Message; parts: Part[] };

const user = (): SessionRecord => ({
  info: { id: 'u1', sessionID: 'session', role: 'user', time: { created: 1 } },
  parts: [text('u1', 'Fix the build')],
});

const answer = (): SessionRecord => ({
  info: {
    id: 'a1', sessionID: 'session', role: 'assistant', agent: 'build',
    providerID: 'anthropic', modelID: 'claude-opus-4-1', time: { created: 2, completed: 3 },
  },
  parts: [text('a1', 'Fixed it')],
});

const session = (id: string, directory: string): Session => ({
  id,
  projectID: 'project',
  directory,
  title: id,
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 1 },
});

describe('session export', () => {
  test('exports attached context as context and drops server prompt plumbing', () => {
    const attached: SessionRecord = {
      info: {
        id: 's1', sessionID: 'session', role: 'synthetic', time: { created: 0 },
        ...createContextPart({ kind: 'chat-quote', quote: 'Earlier answer', text: 'Fix this detail' }),
      },
      parts: [],
    };
    const plumbing: SessionRecord = {
      info: { id: 's2', sessionID: 'session', role: 'synthetic', time: { created: 0 }, text: 'The user is returning after a break.' },
      parts: [],
    };

    const markdown = formatSessionAsMarkdown([plumbing, attached, user(), answer()], 'Session');

    expect(markdown).toContain('**Context**');
    expect(markdown).toContain('Fix this detail');
    expect(markdown).not.toContain('returning after a break');
    expect(markdown).toContain('Fixed it');
  });

  test('loads each descendant transcript from its own returned directory', async () => {
    const loads: Array<{ directory: string; sessionID: string }> = [];
    const result = await collectChildSessionExports({
      children: [{
        session: session('child', '/child-source'),
        children: [{ session: session('grandchild', '/grandchild-source'), children: [] }],
      }],
      fallbackDirectory: '/root-source',
      loadRecords: async (input) => {
        loads.push(input);
        return [];
      },
      untitledSubagentTitle: 'Untitled subagent',
    });

    expect(loads).toEqual([
      { directory: '/child-source', sessionID: 'child' },
      { directory: '/grandchild-source', sessionID: 'grandchild' },
    ]);
    expect(result.children[0]?.children[0]?.title).toBe('grandchild');
    expect(result.skipped).toBe(0);
  });

  test('falls back to the root directory only when a child has none', async () => {
    const loads: Array<{ directory: string; sessionID: string }> = [];
    await collectChildSessionExports({
      children: [{ session: session('child', ''), children: [] }],
      fallbackDirectory: '/root-source',
      loadRecords: async (input) => {
        loads.push(input);
        return [];
      },
      untitledSubagentTitle: 'Untitled subagent',
    });

    expect(loads).toEqual([{ directory: '/root-source', sessionID: 'child' }]);
  });

  test('skips a failed child subtree without discarding a sibling', async () => {
    const result = await collectChildSessionExports({
      children: [
        { session: session('failed', '/failed-source'), children: [{ session: session('descendant', '/other-source'), children: [] }] },
        { session: session('healthy', '/healthy-source'), children: [] },
      ],
      fallbackDirectory: '/root-source',
      loadRecords: async ({ sessionID }) => sessionID === 'failed' ? null : [],
      untitledSubagentTitle: 'Untitled subagent',
    });

    expect(result.children.map((child) => child.title)).toEqual(['healthy']);
    expect(result.skipped).toBe(2);
  });
});
