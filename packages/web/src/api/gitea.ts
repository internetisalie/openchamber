import { z } from 'zod';
import type { GiteaAPI } from '@openchamber/ui/lib/api/types';
import { runtimeFetch } from '@openchamber/ui/lib/runtime-fetch';

const connection = z.object({ instanceUrl: z.string(), user: z.object({ login: z.string() }) });
const repo = z.object({ instanceUrl: z.string(), owner: z.string(), name: z.string(), remote: z.string() });
const item = z.object({
  kind: z.enum(['issue', 'pr']), number: z.number().int().positive(), title: z.string(),
  body: z.string(), url: z.string(), state: z.enum(['open', 'closed']), author: z.string().nullable(),
});
const comment = z.object({ author: z.string().nullable(), body: z.string() });
const pull = z.object({
  draft: z.boolean().nullable(), merged: z.boolean().nullable(),
  sourceBranch: z.string().nullable(), targetBranch: z.string().nullable(), sourceOwner: z.string().nullable(),
  headSha: z.string().nullable(),
});
const reviewComments = z.object({ comments: z.array(z.object({
  id: z.number().int().nullable(), reviewId: z.number().int(), author: z.string().nullable(),
  body: z.string(), path: z.string().nullable(), line: z.number().int().nullable(),
})), truncated: z.boolean() });
const checks = z.object({ state: z.string(), totalCount: z.number().int(), checks: z.array(z.object({
  id: z.number().int().nullable(), name: z.string(), state: z.string(),
  description: z.string().nullable(), url: z.string().nullable(),
})) });
const capabilities = z.object({ canEdit: z.boolean(), canMarkReady: z.boolean(), canMerge: z.boolean(),
  mergeMethods: z.array(z.enum(['merge', 'rebase', 'rebase-merge', 'squash', 'fast-forward-only'])) });
const actionResult = z.object({ repo, item, pull });
const errorBody = z.object({ error: z.string() });

async function read<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorBody.safeParse(payload);
    throw new Error(parsed.success ? parsed.data.error : `Gitea request failed (${response.status})`);
  }
  return schema.parse(payload);
}

export function createWebGiteaAPI(): GiteaAPI {
  return {
    async connections() {
      const result = await read(await runtimeFetch('/api/gitea/connections'),
        z.object({ connections: z.array(connection) }));
      return result.connections;
    },
    async connect(instanceUrl, token, allowHttp) {
      return read(await runtimeFetch('/api/gitea/connections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceUrl, token, allowHttp }),
      }), connection);
    },
    async disconnect(instanceUrl) {
      const result = await read(await runtimeFetch('/api/gitea/connections', {
        method: 'DELETE', query: { instanceUrl },
      }), z.object({ removed: z.boolean() }));
      return result.removed;
    },
    async repository(directory, remote) {
      const query = remote ? { directory, remote } : { directory };
      const response = await runtimeFetch('/api/gitea/repository', { query });
      if (response.status === 404) return null;
      const result = await read(response,
        z.object({ repo }));
      return result.repo;
    },
    async pullRequestStatus(directory, branch, remote, headRemote) {
      const query = headRemote ? { directory, branch, remote, headRemote } : { directory, branch, remote };
      return read(await runtimeFetch('/api/gitea/pr/status', {
        query,
      }), z.object({ repo, item: item.nullable(),
        pull: z.object({ draft: z.boolean().nullable(), merged: z.boolean().nullable() }).nullable(),
        historyIncomplete: z.boolean() }));
    },
    async pullRequestCreate(input) {
      return read(await runtimeFetch('/api/gitea/pr/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      }), item);
    },
    async items(directory, kind, options = {}) {
      const baseQuery = { directory, kind, page: options.page ?? 1 };
      const remoteQuery = options.remote ? { ...baseQuery, remote: options.remote } : baseQuery;
      const query = options.query ? { ...remoteQuery, q: options.query } : remoteQuery;
      return read(await runtimeFetch('/api/gitea/items', { query }),
        z.object({ repo, items: z.array(item), page: z.number().int(), hasMore: z.boolean() }));
    },
    async item(directory, kind, number, remote) {
      const query = remote ? { directory, kind, number, remote } : { directory, kind, number };
      return read(await runtimeFetch('/api/gitea/item', { query }),
        z.object({ repo, item, pull: pull.nullable(), comments: z.array(comment), commentsTruncated: z.boolean() }));
    },
    async reviews(identity) {
      return read(await runtimeFetch('/api/gitea/pr/reviews', { query: { ...identity } }), reviewComments);
    },
    async checks(identity) {
      return read(await runtimeFetch('/api/gitea/pr/checks', { query: { ...identity } }), checks);
    },
    async pullCapabilities(identity) {
      return read(await runtimeFetch('/api/gitea/pr/capabilities', { query: { ...identity } }), capabilities);
    },
    async pullEdit(input) {
      return read(await runtimeFetch('/api/gitea/pr', { method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }), actionResult);
    },
    async pullReady(input) {
      return read(await runtimeFetch('/api/gitea/pr/ready', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }), actionResult);
    },
    async pullMerge(input) {
      return read(await runtimeFetch('/api/gitea/pr/merge', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }), actionResult);
    },
    async comment(input) {
      return read(await runtimeFetch('/api/gitea/comment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      }), comment);
    },
    async pullDiff(directory, number, remote, expectedRepo) {
      const baseQuery = remote ? { directory, number, remote } : { directory, number };
      const query = expectedRepo ? { ...baseQuery, instanceUrl: expectedRepo.instanceUrl,
        owner: expectedRepo.owner, repo: expectedRepo.name } : baseQuery;
      const response = await runtimeFetch('/api/gitea/pull-diff', { query });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const parsed = errorBody.safeParse(payload);
        throw new Error(parsed.success ? parsed.data.error : `Gitea request failed (${response.status})`);
      }
      return response.text();
    },
  };
}
