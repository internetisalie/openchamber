import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { getDefaultTheme } from '@/lib/theme/themes';
import type { Message, Part } from '@/lib/opencode/model';
import type { ToolPopupContent } from './types';

const browser = new Window({ url: 'http://localhost/' });
browser.document.write('<!doctype html><html><head></head><body></body></html>');
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator,
  localStorage: browser.localStorage, sessionStorage: browser.sessionStorage,
  HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, Text: browser.Text,
  HTMLAnchorElement: browser.HTMLAnchorElement, HTMLInputElement: browser.HTMLInputElement,
  HTMLTextAreaElement: browser.HTMLTextAreaElement, HTMLButtonElement: browser.HTMLButtonElement,
  ShadowRoot: browser.ShadowRoot, SVGElement: browser.SVGElement, MutationObserver: browser.MutationObserver,
  DOMParser: browser.DOMParser, DOMRect: browser.DOMRect, XMLSerializer: browser.XMLSerializer,
  IntersectionObserver: browser.IntersectionObserver, ResizeObserver: browser.ResizeObserver,
  customElements: browser.customElements, Event: browser.Event, MouseEvent: browser.MouseEvent,
  KeyboardEvent: browser.KeyboardEvent, getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
});
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
mock.module('../markdown/markdown-shiki.worker.ts?worker&url', () => ({ default: 'blob:test-unused-shiki-worker' }));

const ui = (await import('@/stores/useUIStore')).useUIStore;
const effectiveDirectoryModule = await import('@/hooks/useEffectiveDirectory');
mock.module('@/hooks/useEffectiveDirectory', () => ({ ...effectiveDirectoryModule, useEffectiveDirectory: () => '/project' }));
const theme = getDefaultTheme(false);
mock.module('@/contexts/useThemeSystem', () => ({ useThemeSystem: () => ({ currentTheme: theme }), useOptionalThemeSystem: () => ({ currentTheme: theme }) }));
mock.module('./FadeInOnReveal', () => ({ FadeInOnReveal: ({ children }: { children: React.ReactNode }) => children }));
mock.module('./useCopyMessageLink', () => ({ useCopyMessageLink: () => () => undefined }));

let MarkdownContent: typeof import('../MarkdownRendererImpl')['MarkdownContent'];
// Keep message chrome out of this lifecycle fixture. The row, expansion control,
// serializer, popup owner and content dialog are the production components.
mock.module('./MessageBody', () => ({ default: ({ parts, onShowPopup }: { parts: Part[]; onShowPopup: (popup: ToolPopupContent) => void }) => (
  <>
    <MarkdownContent content={parts.flatMap((part) => part.type === 'text' ? [part.text] : []).join('\n')} enableFileReferences={false} onShowPopup={onShowPopup} />
    <button onClick={() => onShowPopup({ open: true, title: 'Text preview', content: 'Text popup sentinel', metadata: { tool: 'reasoning' } })}>Open text preview</button>
  </>
) }));

let ChatMessage: typeof import('../ChatMessage')['default'];
let Owner: typeof import('./message-popup-owner')['MessagePopupOwner'];
let I18nProvider: typeof import('@/lib/i18n')['I18nProvider'];
let root: Root;
const host = document.createElement('div');
const content = '| Item | Result |\n| --- | --- |\n| Native table sentinel | Accepted |';
const message = (id: string): { info: Message; parts: Part[] } => ({
  info: { id, sessionID: 'session-a', role: 'assistant', agent: 'fixture', providerID: 'fixture', modelID: 'fixture', time: { created: 1, completed: 2 } },
  parts: [{ id: `part-${id}`, messageID: id, sessionID: 'session-a', type: 'text', text: content }],
});
beforeAll(async () => {
  MarkdownContent = (await import('../MarkdownRendererImpl')).MarkdownContent;
  ChatMessage = (await import('../ChatMessage')).default;
  Owner = (await import('./message-popup-owner')).MessagePopupOwner;
  I18nProvider = (await import('@/lib/i18n')).I18nProvider;
  document.body.append(host);
  root = createRoot(host);
});
afterAll(async () => { await act(() => root?.unmount()); await browser.happyDOM.abort(); });

const draw = (row: string | null, scopeKey = 'runtime-a/session-a', owned = true) => act(() => {
  const child = row ? <ChatMessage key={row} message={message(row)} /> : null;
  root.render(<I18nProvider>{owned ? <Owner scopeKey={scopeKey} isMobile={false}>{child}</Owner> : child}</I18nProvider>);
});
const settle = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  }
  expect(condition()).toBe(true);
};
const openTable = async () => {
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Expand table"]');
  expect(button).not.toBeNull();
  await act(() => button!.click());
  await settle(() => document.querySelector('[role="dialog"] td')?.textContent === 'Native table sentinel');
};

test('an expanded table survives actual ChatMessage unmount and replacement until the user closes it', async () => {
  await draw('row-a');
  await openTable();
  const originalRow = document.getElementById('message-row-a')!;
  const dialog = document.querySelector('[role="dialog"]')!;
  await draw(null);
  expect(originalRow.isConnected).toBe(false);
  expect(document.querySelector('[role="dialog"]') === dialog).toBe(true);
  expect(dialog.querySelector('td')?.textContent).toBe('Native table sentinel');
  expect(ui.getState().isImagePreviewOpen).toBe(true);
  await draw('row-b');
  expect(document.getElementById('message-row-b')).not.toBeNull();
  expect(document.querySelector('[role="dialog"]') === dialog).toBe(true);
  const close = dialog.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!;
  await act(() => close.click());
  await settle(() => !document.querySelector('[role="dialog"]'));
  expect(ui.getState().isImagePreviewOpen).toBe(false);
});

test('session/runtime navigation closes the previous conversation preview without resurrection', async () => {
  await draw('row-a');
  await openTable();
  await draw(null, 'runtime-b/session-a');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(ui.getState().isImagePreviewOpen).toBe(false);
  await draw('row-a', 'runtime-a/session-a');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

test('ordinary text popups also survive their message row and close with the column', async () => {
  await draw('row-text');
  const button = Array.from(host.querySelectorAll('button')).find((node) => node.textContent === 'Open text preview')!;
  await act(() => button.click());
  await settle(() => document.querySelector('[role="dialog"]')?.textContent?.includes('Text popup sentinel') === true);
  await draw(null);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Text popup sentinel');
  await act(() => root.render(null));
  expect(ui.getState().isImagePreviewOpen).toBe(false);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

test('a message outside the column owner retains its standalone popup path', async () => {
  await draw('standalone', 'runtime-a/session-a', false);
  await openTable();
  await draw(null, 'runtime-a/session-a', false);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
