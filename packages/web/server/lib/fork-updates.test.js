import { afterEach, expect, it, vi } from 'vitest';
import { fetchForkRelease, isNewerForkVersion } from './fork-updates.js';

afterEach(() => vi.unstubAllGlobals());

it.each([
  ['2.4.0-internetisalie.10', '2.4.0-internetisalie.2', true],
  ['2.4.0-internetisalie.2', '2.4.0-internetisalie.2', false],
  ['2.4.0-internetisalie.1', '2.4.0-internetisalie.2', false],
  ['2.4.1-internetisalie.1', '2.4.0-internetisalie.10', true],
  ['2.4.0-internetisalie.1', '2.4.0', null],
  ['2.4.0-internetisalie.1', '2.4.0-internetisalie.dev', null],
  ['2.4.0-internetisalie.1', '2.4.0-internetisalie.abcdef', null],
])('compares %s with %s', (target, current, expected) => {
  expect(isNewerForkVersion(target, current)).toBe(expected);
});

it.each(['v2.4.1', 'v2.4.0-internetisalie.deadbeef', 'v2.4.0-other.1', 'v2.4.0-internetisalie.0'])('rejects a non-numbered fork tag %s', async (tag) => {
  vi.stubGlobal('fetch', async () => Response.json({ tag_name: tag, draft: false, prerelease: false }));
  await expect(fetchForkRelease('openchamber')).rejects.toThrow();
});

it.each(['draft', 'prerelease'])('rejects %s releases', async (flag) => {
  vi.stubGlobal('fetch', async () => Response.json({ tag_name: 'v2.4.0-internetisalie.3', draft: false, prerelease: false, [flag]: true }));
  await expect(fetchForkRelease('openchamber')).rejects.toThrow();
});

it('constructs release links from the fixed repository and validated tag', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ tag_name: 'v2.0.32-internetisalie.2', draft: false, prerelease: false, html_url: 'https://upstream.invalid', downloadUrl: 'https://upstream.invalid/bin' }));
  expect(await fetchForkRelease('opencode')).toMatchObject({ repository: 'internetisalie/opencode', releaseUrl: 'https://github.com/internetisalie/opencode/releases/tag/v2.0.32-internetisalie.2' });
});
