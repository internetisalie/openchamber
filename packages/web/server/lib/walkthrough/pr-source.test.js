import { describe, expect, it } from 'vitest';
import { parseSource, sourceKey, loadSourceSections } from './sources.js';

describe('repository-qualified PR sources', () => {
  it('keeps old cache keys and separates equal PR numbers in different repositories', () => {
    expect(sourceKey(parseSource({ kind: 'pr', number: 42 }))).toBe('pr:42');
    const upstream = parseSource({ kind: 'pr', number: 42, sourceRepo: { owner: 'upstream', repo: 'project' } });
    const fork = parseSource({ kind: 'pr', number: 42, sourceRepo: { owner: 'fork', repo: 'project' } });
    expect(sourceKey(upstream)).not.toBe(sourceKey(fork));
  });

  it('hands the selected repository to the walkthrough diff loader', async () => {
    const source = parseSource({ kind: 'pr', number: 42, sourceRepo: { owner: 'upstream', repo: 'project' } });
    let received;
    await loadSourceSections('/repo', source, { getPullRequestDiff: async (...args) => {
      received = args;
      return { patch: 'published patch', meta: {} };
    } });
    expect(received).toEqual(['/repo', 42, source.sourceRepo]);
  });

  it('keeps Gitea instances and remotes distinct without changing GitHub keys', async () => {
    const source = parseSource({ kind: 'pr', number: 42, gitea: {
      instanceUrl: 'https://git.example.com', owner: 'team', repo: 'project', remote: 'origin',
    } });
    const other = parseSource({ kind: 'pr', number: 42, gitea: {
      instanceUrl: 'https://other.example.com', owner: 'team', repo: 'project', remote: 'origin',
    } });
    expect(sourceKey(source)).not.toBe(sourceKey(other));
    expect(sourceKey(source)).not.toBe(sourceKey(parseSource({ kind: 'pr', number: 42 })));
    expect(() => parseSource({ kind: 'pr', number: 42, gitea: {
      instanceUrl: 'https://git.example.com/', owner: 'team', repo: 'project', remote: 'origin',
    } })).toThrow();
    let received;
    await loadSourceSections('/repo', source, { getPullRequestDiff: async (...args) => {
      received = args;
      return { patch: 'diff --git a/a b/a', meta: {} };
    } });
    expect(received).toEqual(['/repo', 42, undefined, { source }]);
  });
});
