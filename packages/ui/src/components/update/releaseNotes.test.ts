import { describe, expect, test } from 'bun:test';
import { fetchReleaseNotes, parseReleaseNotesMarkdown } from './releaseNotes';

describe('fetchReleaseNotes', () => {
  test('requests nothing from a fork server that has no release-notes route', async () => {
    const original = globalThis.fetch;
    const calls: unknown[] = [];
    globalThis.fetch = (async (...args: unknown[]) => { calls.push(args); return new Response('', { status: 404 }); }) as unknown as typeof fetch;
    try {
      expect(await fetchReleaseNotes()).toBeNull();
      expect(calls).toEqual([]);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('parseReleaseNotesMarkdown', () => {
  test('reads the title, intro and groups the server writes for a release', () => {
    expect(parseReleaseNotesMarkdown('**Comments everywhere**\n\nA short intro.\n\n### New\n\n- **Comments:** on code.\n\n### Fixes\n\n- Chat: no freeze (thanks to @someone).\n- Git: faster.')).toEqual({
      title: 'Comments everywhere',
      intro: 'A short intro.',
      groups: [
        { key: 'new', bullets: ['**Comments:** on code.'] },
        { key: 'fixes', bullets: ['Chat: no freeze (thanks to @someone).', 'Git: faster.'] },
      ],
    });
  });

  test('a release without a title starts with its groups', () => {
    expect(parseReleaseNotesMarkdown('### Improvements\n\n- Faster.')).toEqual({ title: null, intro: null, groups: [{ key: 'improvements', bullets: ['Faster.'] }] });
  });

  test('other Markdown stays Markdown', () => {
    expect(parseReleaseNotesMarkdown('See release notes at https://github.com/openchamber/openchamber/releases')).toBe(null);
    expect(parseReleaseNotesMarkdown('### Highlights\n\n- Something.')).toBe(null);
    expect(parseReleaseNotesMarkdown('### New\n\nA paragraph under a group.')).toBe(null);
  });
});
