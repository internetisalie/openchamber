import { FORK_UPDATE_ERROR } from '@openchamber/web/server/lib/fork-updates.js';

// An older remote host may still resolve upstream. Never send its install POST.
export const requestRemoteHostUpdate = async () => ({ status: 'failed', error: FORK_UPDATE_ERROR });
