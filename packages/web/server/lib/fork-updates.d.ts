export const FORK_UPDATE_ERROR: string;
export const FORK_UPDATE_CODE: 'FORK_MANUAL_UPDATE_REQUIRED';
type Product = 'openchamber' | 'opencode';
export type ForkRelease = {
  version: string;
  repository: string;
  releaseUrl: string;
  body?: string;
  date?: string;
  installBlocked: 'manual-install';
};
export function forkReleasesUrl(product: Product): string;
export function isNewerForkVersion(target: string, current: string): boolean | null;
export function fetchForkRelease(product: Product): Promise<ForkRelease>;
