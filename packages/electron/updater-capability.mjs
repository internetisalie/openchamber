import fs from 'node:fs';
import path from 'node:path';
import { FORK_UPDATE_ERROR } from '@openchamber/web/server/lib/fork-updates.js';

export const readLinuxPackageType = (resourcesPath = process.resourcesPath) => {
  try {
    return fs.readFileSync(path.join(resourcesPath, 'package-type'), 'utf8').trim();
  } catch {
    return '';
  }
};

export const assertUpdaterCapability = () => {
  throw new Error(FORK_UPDATE_ERROR);
};
