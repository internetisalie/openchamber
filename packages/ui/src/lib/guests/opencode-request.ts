import {
  GUEST_OPENCODE_RESPONSE_MAX,
  GUEST_REQUEST_BODY_MAX,
  isGuestRequestPath,
  type OpenCodeRequest,
} from '@openchamber/sdk';

import { runtimeFetch } from '@/lib/runtime-fetch';

import { guestMay } from './capabilities';
import type { GuestRequestProxyResult } from './oauth';
import type { InstalledGuest } from './types';

type RuntimeFetch = typeof runtimeFetch;

const failed = (code: 'DISABLED' | 'NOT_GRANTED' | 'BAD_PATH' | 'HOST_REJECTED', message: string): GuestRequestProxyResult => ({
  ok: false,
  code,
  message,
});

export const proxyGuestOpenCodeRequest = async (
  guest: InstalledGuest | null,
  request: OpenCodeRequest,
  fetcher: RuntimeFetch = runtimeFetch,
): Promise<GuestRequestProxyResult> => {
  if (guest?.enabled === false) {
    return failed('DISABLED', 'This extension is disabled in Settings -> Extensions.');
  }
  if (!guest || !guestMay(guest, 'opencode')) {
    return failed('NOT_GRANTED', 'The user has not allowed this capability for the extension.');
  }
  const plugin = guest.openCode?.plugins.find((entry) => entry.id === request.pluginId);
  if (!plugin || !plugin.methods.includes(request.method)) {
    return failed('NOT_GRANTED', 'This OpenCode plugin or method was not declared by the extension.');
  }
  if (!isGuestRequestPath(request.path)) {
    return failed('BAD_PATH', 'Request path must stay under the declared OpenCode plugin route.');
  }
  if (request.body !== undefined && request.body.length > GUEST_REQUEST_BODY_MAX) {
    return failed('HOST_REJECTED', 'Request body is too large.');
  }

  const routePrefix = `/api/plugins/${encodeURIComponent(request.pluginId)}`;
  const url = new URL(`${routePrefix}${request.path}`, 'http://openchamber.invalid');
  if (!url.pathname.startsWith(`${routePrefix}/`)) {
    return failed('BAD_PATH', 'Request path must stay under the declared OpenCode plugin route.');
  }
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (!key || typeof value !== 'string') {
      return failed('HOST_REJECTED', 'Request query is malformed.');
    }
    url.searchParams.set(key, value);
  }

  try {
    const response = await fetcher(`${url.pathname}${url.search}`, {
      method: request.method,
      body: request.method === 'GET' ? undefined : request.body,
    });
    const body = await response.text();
    return {
      ok: true,
      result: {
        status: response.status,
        body: body.slice(0, GUEST_OPENCODE_RESPONSE_MAX),
      },
    };
  } catch {
    return failed('HOST_REJECTED', 'OpenCode plugin request failed.');
  }
};
