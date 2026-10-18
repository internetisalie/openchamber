import { describe, expect, test } from 'bun:test';

import type { ToolPopupContent } from './types';
import { isTablePopup } from './popupContent';

const popup = (extra: Partial<ToolPopupContent>): ToolPopupContent => ({ open: true, title: 't', content: 'c', ...extra });

describe('popup content routing', () => {
  test('only a table popup asks for the wide dialog', () => {
    expect(isTablePopup(popup({ metadata: { tool: 'markdown-table' } }))).toBe(true);
    expect(isTablePopup(popup({ metadata: { tool: 'bash' } }))).toBe(false);
    expect(isTablePopup(popup({}))).toBe(false);
  });
});
