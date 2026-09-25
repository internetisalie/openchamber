/**
 * The fork's `/api/plugins/:pluginID/*` route is not in `@opencode/client`.
 * Keep this SDK gap and its directory-scoped transport in the OpenCode module.
 */
import { GUEST_OPENCODE_RESPONSE_MAX, type GuestRequestResult, type OpenCodeRequest } from '@openchamber/sdk';

import { runtimeFetch } from '@/lib/runtime-fetch';

import { OPENCODE_DIRECTORY_HEADER } from './client';

type RuntimeFetch = typeof runtimeFetch;

const readBoundedBody = async (response: Response): Promise<string> => {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (text.length < GUEST_OPENCODE_RESPONSE_MAX) {
      const chunk = await reader.read();
      if (chunk.done) return (text + decoder.decode()).slice(0, GUEST_OPENCODE_RESPONSE_MAX);
      text += decoder.decode(chunk.value, { stream: true });
    }
    await reader.cancel();
    return text.slice(0, GUEST_OPENCODE_RESPONSE_MAX);
  } finally {
    reader.releaseLock();
  }
};

export const isGuestPluginRoutePath = (pluginId: string, path: string): boolean => {
  const prefix = `/api/plugins/${encodeURIComponent(pluginId)}`;
  return new URL(`${prefix}${path}`, 'http://openchamber.invalid').pathname.startsWith(`${prefix}/`);
};

export const requestGuestPluginRoute = async (
  request: OpenCodeRequest,
  directory: string,
  fetcher: RuntimeFetch = runtimeFetch,
): Promise<GuestRequestResult> => {
  const prefix = `/api/plugins/${encodeURIComponent(request.pluginId)}`;
  const url = new URL(`${prefix}${request.path}`, 'http://openchamber.invalid');
  if (!isGuestPluginRoutePath(request.pluginId, request.path)) throw new Error('Plugin route escaped its declared prefix.');
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (!key) throw new Error('Plugin request query is malformed.');
    url.searchParams.set(key, value);
  }

  const response = await fetcher(`${url.pathname}${url.search}`, {
    method: request.method,
    headers: { [OPENCODE_DIRECTORY_HEADER]: encodeURIComponent(directory) },
    body: request.method === 'GET' ? undefined : request.body,
  });
  return { status: response.status, body: await readBoundedBody(response) };
};
