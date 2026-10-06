import { describe, expect, test } from 'bun:test';

import { isTablePopup, opensInChatDialog } from './popupContent';

const popup = (extra: Record<string, unknown>) => ({ open: true, title: 't', content: 'c', ...extra }) as never;

describe('popup content routing', () => {
  test('image, mermaid and table popups open in the chat dialog', () => {
    expect(opensInChatDialog(popup({ image: { url: 'u' } }))).toBe(true);
    expect(opensInChatDialog(popup({ mermaid: { url: 'u', source: 's', filename: 'f' } }))).toBe(true);
    expect(opensInChatDialog(popup({ metadata: { tool: 'markdown-table' } }))).toBe(true);
  });

  test('other popups do not', () => {
    expect(opensInChatDialog(popup({}))).toBe(false);
    expect(opensInChatDialog(popup({ metadata: { tool: 'bash' } }))).toBe(false);
  });

  test('only a table popup asks for the wide dialog', () => {
    expect(isTablePopup(popup({ metadata: { tool: 'markdown-table' } }))).toBe(true);
    expect(isTablePopup(popup({ metadata: { tool: 'bash' } }))).toBe(false);
    expect(isTablePopup(popup({}))).toBe(false);
  });
});
