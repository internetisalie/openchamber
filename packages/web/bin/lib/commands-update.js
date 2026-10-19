import { FORK_UPDATE_CODE, FORK_UPDATE_ERROR, forkReleasesUrl } from '../../server/lib/fork-updates.js';
import { isJsonMode, printJson } from '../cli-output.js';

function createUpdateCommand() {
  return async function updateCommand(options = {}) {
    // Refuse before discovering or stopping any running instance.
    if (isJsonMode(options)) {
      printJson({ status: 'error', success: false, code: FORK_UPDATE_CODE, error: FORK_UPDATE_ERROR, releaseUrl: forkReleasesUrl('openchamber') });
      process.exitCode = 1;
      return;
    }
    throw new Error(FORK_UPDATE_ERROR);
  };
}

export { createUpdateCommand };
