import { z } from 'zod';

export const FORK_UPDATE_ERROR = 'In-place updates are disabled for this fork. Replace the installation using a verified release from internetisalie on GitHub.';
export const FORK_UPDATE_CODE = 'FORK_MANUAL_UPDATE_REQUIRED';

const repositories = Object.freeze({ openchamber: 'internetisalie/openchamber', opencode: 'internetisalie/opencode' });
const versionSchema = z.string().regex(/^\d+\.\d+\.\d+-internetisalie\.[1-9]\d*$/);
const releaseSchema = z.object({
  tag_name: z.string(),
  draft: z.literal(false),
  prerelease: z.literal(false),
  body: z.string().nullable().optional(),
  published_at: z.string().nullable().optional(),
});

export const forkReleasesUrl = (product) => `https://github.com/${repositories[product]}/releases`;

// Numbered fork revisions are ordered numerically. Hash-labelled historical
// builds are intentionally incomparable; a check must not imply a downgrade.
export const isNewerForkVersion = (target, current) => {
  const next = versionSchema.parse(target).split(/[-.]/);
  if (!versionSchema.safeParse(current).success) return null;
  const previous = current.split(/[-.]/);
  for (const index of [0, 1, 2, 4]) {
    const difference = Number(next[index]) - Number(previous[index]);
    if (difference !== 0) return difference > 0;
  }
  return false;
};

export const fetchForkRelease = async (product) => {
  const repository = repositories[product];
  if (!repository) throw new Error('Unknown fork release repository.');
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Fork release check failed with HTTP ${response.status}.`);
  const release = releaseSchema.parse(await response.json());
  const version = versionSchema.parse(release.tag_name.replace(/^v/, ''));
  return {
    version,
    repository,
    releaseUrl: `${forkReleasesUrl(product)}/tag/v${version}`,
    body: release.body ?? undefined,
    date: release.published_at ?? undefined,
    installBlocked: 'manual-install',
  };
};
