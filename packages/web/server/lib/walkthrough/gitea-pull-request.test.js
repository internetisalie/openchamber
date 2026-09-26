import { describe, expect, it, vi } from 'vitest';

const { requestGitea, resolveGiteaRepo } = vi.hoisted(() => ({
  requestGitea: vi.fn(), resolveGiteaRepo: vi.fn(),
}));
vi.mock('../gitea/client.js', () => ({ requestGitea }));
vi.mock('../gitea/repo.js', () => ({ resolveGiteaRepo }));

const { getGiteaPullRequestDiff, getGiteaPullRequestFileContents } =
  await import('./gitea-pull-request.js');

const source = { kind: 'pr', number: 7, gitea: { instanceUrl: 'https://git.example.com',
  owner: 'team', repo: 'project', remote: 'upstream' } };
const connection = { instanceUrl: source.gitea.instanceUrl, token: 'private-token' };
const resolved = { connection, repo: { owner: 'team', name: 'project' }, remote: 'upstream' };
const base = 'a'.repeat(40);
const head = 'b'.repeat(40);

describe('Gitea PR walkthrough source', () => {
  it('rejects a changed remote before fetching a diff', async () => {
    resolveGiteaRepo.mockResolvedValue({ ...resolved, repo: { owner: 'other', name: 'project' } });
    requestGitea.mockReset();
    await expect(getGiteaPullRequestDiff('/repo', source)).rejects.toMatchObject({ statusCode: 409 });
    expect(requestGitea).not.toHaveBeenCalled();
  });

  it('uses the published diff and merge-base/head files from the saved instance', async () => {
    resolveGiteaRepo.mockResolvedValue(resolved);
    requestGitea.mockImplementation(async (_connection, path) => {
      if (path.endsWith('/pulls/7.diff')) return 'diff --git a/a.txt b/a.txt\n';
      if (path.endsWith('/pulls/7')) return { merge_base: base,
        head: { sha: head, repo: { owner: { login: 'fork' }, name: 'project' } } };
      if (path.includes('ref=' + base)) return { type: 'file', encoding: 'base64',
        content: Buffer.from('before').toString('base64') };
      if (path.includes('ref=' + head)) return { type: 'file', encoding: 'base64',
        content: Buffer.from('after').toString('base64') };
      throw new Error('Unexpected request');
    });
    expect((await getGiteaPullRequestDiff('/repo', source)).patch).toContain('diff --git');
    const file = await getGiteaPullRequestFileContents('/repo', source,
      { path: 'src/a.txt', status: 'M' });
    expect(file).toEqual({ original: 'before', modified: 'after' });
    expect(requestGitea).toHaveBeenCalledWith(connection,
      expect.stringContaining(`/repos/team/project/contents/src/a.txt?ref=${base}`));
    expect(requestGitea).toHaveBeenCalledWith(connection,
      expect.stringContaining(`/repos/fork/project/contents/src/a.txt?ref=${head}`));
  });
});
