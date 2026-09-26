import { z } from 'zod';
import { requestGitea } from '../gitea/client.js';
import { resolveGiteaRepo } from '../gitea/repo.js';

const fail = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, code });
const shaPattern = /^[0-9a-f]{40,64}$/i;
const MAX_FILE_BYTES = 4_000_000;
const fileResponseSchema = z.object({ type: z.literal('file'), encoding: z.literal('base64'), content: z.string() });
const pullRefsSchema = z.object({
  merge_base: z.string().regex(shaPattern),
  head: z.object({ sha: z.string().regex(shaPattern), repo: z.object({
    owner: z.object({ login: z.string().min(1) }), name: z.string().min(1),
  }) }),
});

async function resolveSource(directory, source) {
  const expected = source.gitea;
  const resolved = await resolveGiteaRepo(directory, expected.remote);
  if (!resolved || resolved.connection.instanceUrl !== expected.instanceUrl ||
      resolved.repo.owner !== expected.owner || resolved.repo.name !== expected.repo) {
    throw fail('The Gitea repository changed. Select the pull request again.', 409, 'gitea-repository-changed');
  }
  const root = `/repos/${encodeURIComponent(expected.owner)}/${encodeURIComponent(expected.repo)}`;
  return { ...resolved, root };
}

export async function getGiteaPullRequestDiff(directory, source, { allowEmpty = false } = {}) {
  const resolved = await resolveSource(directory, source);
  const patch = await requestGitea(resolved.connection, `${resolved.root}/pulls/${source.number}.diff`,
    { accept: 'text/plain' });
  if (!z.string().safeParse(patch).success || patch && !patch.startsWith('diff --git ')) {
    throw fail('Gitea returned an invalid pull request diff', 502, 'invalid-gitea-diff');
  }
  if (!allowEmpty && !patch.trim()) throw fail(`Pull request #${source.number} has no diff`, 404, 'empty-diff');
  return { patch, meta: { provider: 'gitea', instanceUrl: source.gitea.instanceUrl,
    owner: source.gitea.owner, repo: source.gitea.repo, number: source.number } };
}

function validPath(path) {
  return z.string().min(1).max(4095).safeParse(path).success &&
    !path.startsWith('/') && !path.includes('\\') && !path.includes('\0') &&
    path.split('/').every((part) => part && part !== '.' && part !== '..');
}

async function readFile(connection, owner, repo, path, ref) {
  if (!validPath(path)) throw fail('Invalid pull request file path', 400, 'invalid-file-path');
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const raw = await requestGitea(connection,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`);
  const parsed = fileResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw fail('This Gitea file cannot be shown in full', 415, 'unsupported-file');
  }
  const bytes = Buffer.from(parsed.data.content.replace(/\s/g, ''), 'base64');
  if (bytes.byteLength > MAX_FILE_BYTES) throw fail('This file is too large to show in full', 413, 'file-too-large');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export async function getGiteaPullRequestFileContents(directory, source, { path, previousPath, status }) {
  const resolved = await resolveSource(directory, source);
  const pull = await requestGitea(resolved.connection, `${resolved.root}/pulls/${source.number}`);
  // Gitea exposes the PR's merge base directly; its base branch tip may include
  // unrelated commits and would not match the published three-dot patch.
  const refs = pullRefsSchema.safeParse(pull);
  if (!refs.success) {
    throw fail('Gitea returned invalid pull request refs', 502, 'invalid-gitea-refs');
  }
  const { merge_base: baseSha, head: { sha: headSha, repo: headRepo } } = refs.data;
  const [original, modified] = await Promise.all([
    status === 'A' ? '' : readFile(resolved.connection, resolved.repo.owner, resolved.repo.name,
      previousPath || path, baseSha),
    status === 'D' ? '' : readFile(resolved.connection, headRepo.owner.login, headRepo.name, path, headSha),
  ]);
  return { original, modified };
}
