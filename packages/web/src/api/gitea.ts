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
    async repository(directory) {
      const result = await read(await runtimeFetch('/api/gitea/repository', { query: { directory } }),
        z.object({ repo }));
      return result.repo;
    },
    async items(directory, kind, page = 1) {
      return read(await runtimeFetch('/api/gitea/items', { query: { directory, kind, page } }),
        z.object({ repo, items: z.array(item), page: z.number().int(), hasMore: z.boolean() }));
    },
    async item(directory, kind, number) {
      return read(await runtimeFetch('/api/gitea/item', { query: { directory, kind, number } }),
        z.object({ repo, item, comments: z.array(comment), commentsTruncated: z.boolean() }));
    },
    async pullDiff(directory, number) {
      const response = await runtimeFetch('/api/gitea/pull-diff', { query: { directory, number } });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const parsed = errorBody.safeParse(payload);
        throw new Error(parsed.success ? parsed.data.error : `Gitea request failed (${response.status})`);
      }
      return response.text();
    },
  };
}
