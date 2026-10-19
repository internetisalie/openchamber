import { FORK_UPDATE_ERROR } from '../fork-updates.js';

export const supportsOpenCodeV2Install = () => false;

export const installOpenCodeV2 = async () => {
  throw new Error(FORK_UPDATE_ERROR);
};
