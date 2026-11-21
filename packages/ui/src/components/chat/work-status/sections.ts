import { z } from 'zod';

import type { I18nKey } from '@/lib/i18n/messages/en';

/**
 * Every section the work-status panel can render, in default display order.
 *
 * One list drives both the panel and its settings dialog, so a section cannot
 * exist in the panel without being switchable, or appear in the dialog without
 * existing.
 *
 * The ids are persisted in user settings — renaming one silently resets that
 * user's choice for it.
 */
export const WORK_STATUS_SECTION_IDS = [
  'session',
  'repository',
  'usage',
  'contextSources',
  'telemetry',
  'subagents',
  'ptys',
  'tasks',
  'workflows',
  'mcp',
  'pinned',
] as const;

export type WorkStatusSectionId = (typeof WORK_STATUS_SECTION_IDS)[number];

export const WORK_STATUS_SECTION_LABEL_KEYS = {
  session: 'chat.workStatus.section.session',
  repository: 'chat.workStatus.section.project',
  usage: 'chat.workStatus.section.usage',
  telemetry: 'chat.workStatus.section.telemetry',
  subagents: 'chat.workStatus.section.subagents',
  ptys: 'chat.workStatus.section.ptys',
  tasks: 'chat.workStatus.section.tasks',
  workflows: 'chat.workStatus.section.workflows',
  mcp: 'chat.workStatus.section.mcp',
  pinned: 'chat.workStatus.section.pinned',
  contextSources: 'chat.workStatus.section.contextBreakdown',
} as const satisfies Record<WorkStatusSectionId, I18nKey>;

/**
 * A section contributed by an installed extension (`contributes.statusSection`),
 * keyed by its extension id. Persisted next to the built-in ids.
 */
export type ExtensionSectionId = `ext:${string}`;

/** Any id the panel can place: a built-in section or an extension's. */
export type WorkStatusPanelSectionId = WorkStatusSectionId | ExtensionSectionId;

const EXTENSION_SECTION_ID = /^ext:[a-z][a-z0-9-]*$/;

export const extensionSectionId = (guestId: string): ExtensionSectionId => `ext:${guestId}`;

export const isExtensionSectionId = (value: string): value is ExtensionSectionId => EXTENSION_SECTION_ID.test(value);

// Extension ids are kept even when that extension is not installed right now:
// the catalog loads after settings, and a paused or reinstalled extension
// should come back where the user put it.
const storedSectionIdSchema = z.union([
  z.enum(WORK_STATUS_SECTION_IDS),
  z.templateLiteral(['ext:', z.string().regex(/^[a-z][a-z0-9-]*$/)]),
]);

const readStoredSectionId = (value: unknown): WorkStatusPanelSectionId | null => {
  const parsed = storedSectionIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

// The default before Context sources moved up. Clients saved the default as
// their order without the user choosing it. Sections added since then don't
// count when recognizing that default.
const DEFAULT_ORDER_WITH_CONTEXT_SOURCES_LAST: readonly WorkStatusPanelSectionId[] = [
  'session', 'repository', 'usage', 'subagents', 'mcp', 'pinned', 'contextSources',
];

const isDefaultOrderWithContextSourcesLast = (order: readonly WorkStatusPanelSectionId[]): boolean => {
  const ptys = order.indexOf('ptys');
  if (ptys !== -1 && order[ptys - 1] !== 'subagents') return false;
  const placed = order.filter((id) => id !== 'telemetry' && id !== 'workflows' && id !== 'ptys' && id !== 'tasks');
  return placed.length === DEFAULT_ORDER_WITH_CONTEXT_SOURCES_LAST.length
    && placed.every((id, index) => id === DEFAULT_ORDER_WITH_CONTEXT_SOURCES_LAST[index]);
};

/**
 * A built-in section added after users had saved orders goes beside the one
 * it follows by default, so it lands where the default puts it rather than
 * at the bottom of every saved list. Sections added before this rule were
 * appended and saved there, so they stay out of it.
 */
const PLACED_AFTER = new Map<WorkStatusSectionId, WorkStatusSectionId>([['ptys', 'subagents'], ['tasks', 'subagents']]);

/**
 * Preserve chosen positions, discard obsolete ids, and add newly added
 * built-in sections: after their default neighbour (`PLACED_AFTER`), else at
 * the end. `arranged` is false for an order the user never set by hand, which
 * follows the default's move of Context sources.
 */
export const sanitizeWorkStatusSectionOrder = (
  value: readonly string[] | null | undefined,
  arranged = true,
): WorkStatusPanelSectionId[] => {
  const ordered = new Set<WorkStatusPanelSectionId>();
  if (Array.isArray(value)) {
    for (const entry of value) {
      const id = readStoredSectionId(entry);
      if (id) ordered.add(id);
    }
  }
  const order = [...ordered];
  for (const id of WORK_STATUS_SECTION_IDS) {
    if (ordered.has(id)) continue;
    const after = PLACED_AFTER.get(id);
    let at = after ? order.indexOf(after) : -1;
    // Keep the default Subagents → Agent PTYs → Tasks sequence when the PTYs
    // are still next to Subagents. A separately moved PTY section stays put.
    if (id === 'tasks' && at >= 0 && order[at + 1] === 'ptys') at += 1;
    if (at === -1) order.push(id);
    else order.splice(at + 1, 0, id);
    ordered.add(id);
  }
  if (arranged || !isDefaultOrderWithContextSourcesLast(order)) return order;
  const moved: WorkStatusPanelSectionId[] = order.filter((id) => id !== 'contextSources');
  moved.splice(moved.indexOf('usage') + 1, 0, 'contextSources');
  return moved;
};

/**
 * What the panel and the sections dialog show: the saved order with sections
 * of extensions that are not available here left out, and available ones the
 * saved order does not know appended in the order given. Built-in sections
 * the build lacks (`unavailable`) are left out too.
 */
export const resolveWorkStatusSectionOrder = (
  stored: readonly string[] | null | undefined,
  extensionIds: readonly ExtensionSectionId[],
  unavailable: readonly WorkStatusSectionId[] = [],
): WorkStatusPanelSectionId[] => {
  const available = new Set<string>(extensionIds);
  const missing = new Set<string>(unavailable);
  const order = sanitizeWorkStatusSectionOrder(stored)
    .filter((id) => !missing.has(id) && (!isExtensionSectionId(id) || available.has(id)));
  const placed = new Set<string>(order);
  for (const id of extensionIds) {
    if (!placed.has(id)) order.push(id);
  }
  return order;
};

/**
 * The saved order after the listed sections were rearranged to `shown`.
 * Saved ids that are not listed (paused extensions, sections this runtime or
 * the phone does not offer) keep their saved slots, and the listed ones fill
 * the remaining slots in their new order. Listed ids the saved order did not
 * know follow at the end.
 */
export const mergeWorkStatusSectionOrder = (
  stored: readonly string[],
  shown: readonly string[],
): string[] => {
  const listed = new Set<string>(shown);
  const merged: string[] = [];
  let next = 0;
  for (const id of stored) {
    if (!listed.has(id)) merged.push(id);
    else if (next < shown.length) merged.push(shown[next++]);
  }
  const placed = new Set<string>(merged);
  for (; next < shown.length; next += 1) {
    if (!placed.has(shown[next])) merged.push(shown[next]);
  }
  return merged;
};

/**
 * Hidden sections are stored, not visible ones. Every section is on by default.
 */
export const isWorkStatusSectionVisible = (
  hidden: readonly string[] | null | undefined,
  id: WorkStatusPanelSectionId,
): boolean => !hidden?.includes(id);

/**
 * True when every section the panel could show appears in the hidden set.
 *
 * Uses `.every()` instead of a length comparison so that stale ids left over
 * from a removed section cannot inflate the count past the current list length.
 */
export const areAllWorkStatusSectionsHidden = (
  hidden: readonly string[] | null | undefined,
  extensionIds: readonly ExtensionSectionId[] = [],
  unavailable: readonly WorkStatusSectionId[] = [],
): boolean =>
  hidden != null
  && WORK_STATUS_SECTION_IDS.every((id) => unavailable.includes(id) || hidden.includes(id))
  && extensionIds.every((id) => hidden.includes(id));

export const getWorkStatusPanelPresentation = ({
  visible,
  contentMounted,
  renderedSections,
  allSectionsHidden,
}: {
  visible: boolean;
  contentMounted: boolean;
  renderedSections: number;
  allSectionsHidden: boolean;
}): { interactive: boolean; showEmptyState: boolean } => ({
  interactive: visible && (renderedSections > 0 || allSectionsHidden),
  showEmptyState: contentMounted && allSectionsHidden,
});

export const sanitizeWorkStatusHiddenSections = (value: unknown, explicit = true): WorkStatusPanelSectionId[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<WorkStatusPanelSectionId>();
  for (const entry of value) {
    const id = readStoredSectionId(entry);
    if (id) seen.add(id);
  }
  // Older clients hid telemetry automatically until the user chose a list.
  if (!explicit) seen.delete('telemetry');
  return [...seen];
};
