import {
  GUEST_OPENCODE_RESPONSE_MAX,
  GUEST_REQUEST_BODY_MAX,
  isGuestRequestPath,
  type OpenCodeRequest,
} from '@openchamber/sdk';

import { isGuestPluginRoutePath, requestGuestPluginRoute } from '@/lib/opencode/guest-plugin-request';

import { guestMay } from './capabilities';
import type { GuestRequestProxyResult } from './oauth';
import type { InstalledGuest } from './types';

type PluginRouteRequester = typeof requestGuestPluginRoute;

const failed = (code: 'DISABLED' | 'NOT_GRANTED' | 'NO_DIRECTORY' | 'BAD_PATH' | 'HOST_REJECTED', message: string): GuestRequestProxyResult => ({
  ok: false,
  code,
  message,
});

export const proxyGuestOpenCodeRequest = async (
  guest: InstalledGuest | null,
  request: OpenCodeRequest,
  directory: string | null,
  requester: PluginRouteRequester = requestGuestPluginRoute,
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
  if (!isGuestRequestPath(request.path) || !isGuestPluginRoutePath(request.pluginId, request.path)) {
    return failed('BAD_PATH', 'Request path must stay under the declared OpenCode plugin route.');
  }
  if (request.body !== undefined && request.body.length > GUEST_REQUEST_BODY_MAX) {
    return failed('HOST_REJECTED', 'Request body is too large.');
  }
  if (Object.keys(request.query ?? {}).some((key) => !key)) {
    return failed('HOST_REJECTED', 'Request query is malformed.');
  }
  if (!directory) return failed('NO_DIRECTORY', 'No project is open.');

  try {
    const response = await requester(request, directory);
    return {
      ok: true,
      result: {
        status: response.status,
        body: response.body.slice(0, GUEST_OPENCODE_RESPONSE_MAX),
      },
    };
  } catch {
    return failed('HOST_REJECTED', 'OpenCode plugin request failed.');
  }
};
