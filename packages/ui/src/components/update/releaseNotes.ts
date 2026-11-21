import { z } from 'zod';
import { getCurrentIntlLocale } from '@/lib/i18n';

const releaseNotesResponseSchema = z.object({
  releases: z.array(z.object({
    version: z.string(),
    /** YYYY-MM-DD */
    date: z.string(),
    title: z.string().nullable(),
    intro: z.string().nullable(),
    /** Non-empty groups in the order the changelog lists them; bullets are Markdown. */
    groups: z.array(z.object({
      key: z.enum(['new', 'improvements', 'fixes', 'sdk', 'misc']),
      bullets: z.array(z.string()).min(1),
    })),
  })),
});

export type ReleaseNotesRelease = z.infer<typeof releaseNotesResponseSchema>['releases'][number];
export type ReleaseNotesGroupKey = ReleaseNotesRelease['groups'][number]['key'];
export type ReleaseNotesContent = Pick<ReleaseNotesRelease, 'title' | 'intro' | 'groups'>;

// The headings the server writes for each group (`lib/changelog/update-notes.js`).
const GROUP_KEY_BY_HEADING = new Map<string, ReleaseNotesGroupKey>([
  ['New', 'new'],
  ['Improvements', 'improvements'],
  ['Fixes', 'fixes'],
  ['SDK', 'sdk'],
  ['Misc', 'misc'],
]);

/**
 * One release of the update dialog's Markdown (`**title**`, intro, then
 * `### Group` and `- bullet` lines) as data, or null for any other shape,
 * such as release notes the desktop updater took from GitHub.
 */
export function parseReleaseNotesMarkdown(content: string): ReleaseNotesContent | null {
  const lines = content.split('\n').map((line) => line.trimEnd()).filter((line) => line.trim().length > 0);
  let title: string | null = null;
  const intro: string[] = [];
  const groups: ReleaseNotesContent['groups'] = [];
  for (const [index, line] of lines.entries()) {
    const heading = /^### (.+)$/.exec(line)?.[1];
    const current = groups.at(-1);
    if (heading !== undefined) {
      const key = GROUP_KEY_BY_HEADING.get(heading);
      if (!key) return null;
      groups.push({ key, bullets: [] });
    } else if (current) {
      if (!line.startsWith('- ')) return null;
      current.bullets.push(line.slice(2));
    } else if (index === 0 && /^\*\*.+\*\*$/.test(line)) {
      title = line.slice(2, -2);
    } else {
      intro.push(line);
    }
  }
  const filled = groups.filter((group) => group.bullets.length > 0);
  return filled.length > 0 ? { title, intro: intro.length > 0 ? intro.join('\n\n') : null, groups: filled } : null;
}

/**
 * The releases of `version`, newest first. This fork's server registers no
 * `/api/openchamber/release-notes` route (the notes come from the upstream
 * changelog, and the fork's updates are manual), so nothing is requested and
 * the answer is always null, which Settings > About shows as no notes.
 */
export async function fetchReleaseNotes(): Promise<ReleaseNotesRelease[] | null> {
  return null;
}

/** "Nov 8, 2026" for 2026-11-08 in the UI locale; the input as is when it is no date. */
export function formatReleaseDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat(getCurrentIntlLocale(), { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

/** Turns @username into a link to the GitHub profile. */
export function linkReleaseNoteMentions(content: string): string {
  return content.replace(/(^|[^a-zA-Z0-9])@([a-zA-Z0-9-]+)/g, '$1[@$2](https://github.com/$2)');
}
