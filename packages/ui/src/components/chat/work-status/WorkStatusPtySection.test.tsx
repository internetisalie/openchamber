import { afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { OpenCodePtySession } from '@/lib/opencode/pty-bridge';

let Section: typeof import('./WorkStatusPtySection').WorkStatusPtySection;
let uiStore: typeof import('@/stores/useUIStore').useUIStore;
let Provider: typeof import('@/lib/i18n').I18nProvider;
let root: Root;
let container: HTMLDivElement;
let win: Window;
let restore: () => void;
let sessions: OpenCodePtySession[];
let parents: Array<string | null>;

const pty = (id: string, status: OpenCodePtySession['status'], parentSessionId = 'session-one'): OpenCodePtySession => ({
  id, parentSessionId, title: id, command: 'sh', args: [], workdir: '/fixture', status, createdAt: '2026-10-04T12:00:00Z',
});

const render = (sessionId = 'session-one', active = true) => act(async () => {
  root.render(<Provider><Section sessionId={sessionId} active={active} /></Provider>);
});

const settle = async () => {
  for (let attempt = 0; attempt < 20 && !container.textContent?.includes('live-shell'); attempt += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  }
};

const button = (label: string) => {
  const match = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(label));
  if (!match) throw new Error(`Button missing: ${label}`);
  return match;
};

beforeEach(async () => {
  win = new Window({ url: 'http://pty-fixture.test' });
  sessions = [pty('live-shell', 'running'), pty('stopping-shell', 'killing'), pty('finished-shell', 'exited'), pty('killed-shell', 'killed'), pty('unrelated-shell', 'running', 'another-session')];
  parents = [];
  const values = {
    window: win, document: win.document, navigator: win.navigator, Node: win.Node, Element: win.Element,
    HTMLElement: win.HTMLElement, localStorage: win.localStorage, getComputedStyle: win.getComputedStyle.bind(win),
    requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://pty-fixture.test');
      if (url.pathname === '/api/plugins/opencode-pty-bridge') return Response.json({ id: 'opencode-pty-bridge', schemaVersion: 1, opencodePtyVersion: '0.5.0' });
      if (url.pathname === '/api/plugins/opencode-pty-bridge/sessions') {
        parents.push(url.searchParams.get('parentSessionId'));
        return Response.json({ schemaVersion: 1, revision: 1, sessions });
      }
      throw new Error(`Unexpected fixture request: ${url.pathname}`);
    },
  };
  const previous = Object.keys(values).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  restore = () => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  };
  ({ WorkStatusPtySection: Section } = await import('./WorkStatusPtySection'));
  ({ useUIStore: uiStore } = await import('@/stores/useUIStore'));
  ({ I18nProvider: Provider } = await import('@/lib/i18n'));
  uiStore.setState({ workStatusExpandedSections: {}, showExitedAgentPtys: false });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  await win.happyDOM.close();
  restore();
});

test('collapsed count and expanded filter are mutually exclusive and never show another session', async () => {
  await render();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 15)); });
  expect(button('Agent PTYs').textContent).toBe('Agent PTYs2');
  expect(container.textContent).not.toContain('Show exited');
  await act(async () => button('Agent PTYs').click());
  await settle();
  expect(button('Agent PTYs').textContent).toBe('Agent PTYs');
  expect(container.textContent).toContain('stopping-shell');
  expect(container.textContent).not.toContain('finished-shell');
  expect(container.textContent).not.toContain('unrelated-shell');
  await act(async () => button('Show exited').click());
  expect(container.textContent).toContain('finished-shell');
  expect(container.textContent).toContain('killed-shell');
  expect(uiStore.getState().showExitedAgentPtys).toBe(true);
  await act(async () => button('Hide exited').click());
  expect(container.textContent).not.toContain('finished-shell');
  await act(async () => button('Agent PTYs').click());
  expect(button('Agent PTYs').textContent).toBe('Agent PTYs2');
  expect(container.textContent).not.toContain('Show exited');
  expect(parents).toEqual(['session-one']);
});

test('an all-exited list keeps its filter so historical output remains discoverable', async () => {
  sessions = [pty('finished-shell', 'exited'), pty('killed-shell', 'killed')];
  uiStore.setState({ workStatusExpandedSections: { ptys: true } });
  await render();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 15)); });
  expect(container.textContent).toContain('No active PTYs for this session');
  await act(async () => button('Show exited').click());
  expect(container.textContent).toContain('finished-shell');
  expect(container.textContent).toContain('killed-shell');
});

test('inactive view makes no bridge requests; session switches discard the old list', async () => {
  uiStore.setState({ workStatusExpandedSections: { ptys: true } });
  await render('session-one', false);
  expect(parents).toEqual([]);
  await render();
  await settle();
  expect(container.textContent).toContain('live-shell');
  await render('session-two');
  expect(container.textContent).not.toContain('live-shell');
  expect(parents).toEqual(['session-one', 'session-two']);
  await render('session-two', false);
  expect(container.textContent).not.toContain('live-shell');
});
