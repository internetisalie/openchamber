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
});
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
      }), z.object({ repo, item: item.nullable() }));
    },
    async pullRequestCreate(input) {
      return read(await runtimeFetch('/api/gitea/pr/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      }), item);
    },
    async items(directory, kind, page = 1) {
      return read(await runtimeFetch('/api/gitea/items', { query: { directory, kind, page } }),
        z.object({ repo, items: z.array(item), page: z.number().int(), hasMore: z.boolean() }));
    },
    async item(directory, kind, number, remote) {
      const query = remote ? { directory, kind, number, remote } : { directory, kind, number };
      return read(await runtimeFetch('/api/gitea/item', { query }),
        z.object({ repo, item, pull: pull.nullable(), comments: z.array(comment), commentsTruncated: z.boolean() }));
    },
    async comment(input) {
      return read(await runtimeFetch('/api/gitea/comment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      }), comment);
    },
    async pullDiff(directory, number, remote) {
      const query = remote ? { directory, number, remote } : { directory, number };
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
