import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Session } from '@/lib/opencode/model';
import { opencodeClient } from '@/lib/opencode/client';
import { ensureChatsRootDirectory } from '@/lib/chatDirectories';
import { sessionEvents, type SessionDeleteRequest } from '@/lib/sessionEvents';
const browser = new Window({ url: 'http://localhost' });
let root: Root;
const descriptors = new Map<string, PropertyDescriptor | undefined>();
// React DOM detects input-event support when imported, so install the DOM first.
for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage, Element: browser.Element, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { value, configurable: true });
}
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { useUIStore } = await import('@/stores/useUIStore');
const { useGlobalSessionsStore } = await import('@/stores/useGlobalSessionsStore');
const { useSessionUIStore } = await import('@/sync/session-ui-store');
const { ArchiveSessionsView, ArchiveView } = await import('./ArchiveView');
const initialUI = useUIStore.getState();
const initialSessions = useGlobalSessionsStore.getState();
const initialSessionUI = useSessionUIStore.getState();
const session = (id: string, title: string, archived = 2): Session => ({
  id, title, projectID: 'project', cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, directory: '/workspace',
  time: { created: 1, updated: 1, archived },
});

const originalHomeInfo = opencodeClient.getFilesystemHomeInfo;
opencodeClient.getFilesystemHomeInfo = async () => ({ home: '/home' });
try {
  await ensureChatsRootDirectory();
} finally {
  opencodeClient.getFilesystemHomeInfo = originalHomeInfo;
}

beforeEach(() => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  useUIStore.setState({ isArchivePageOpen: true });
});

afterEach(async () => {
  await act(async () => root.unmount());
  useUIStore.setState(initialUI);
  useGlobalSessionsStore.setState(initialSessions);
  useSessionUIStore.setState(initialSessionUI);
  document.body.replaceChildren();
});

afterAll(async () => {
  await browser.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test('archive search uses exact IDs and preserves title search and archive membership', async () => {
  const id = 'ses_f88b1a2b3c4d';
  useGlobalSessionsStore.setState({
    archivedSessions: [session(id, 'Release notes'), session('ses_f88b1a2b3c4e', id)],
    activeSessions: [session('ses_active', 'Active session', 0)],
  });
  await act(async () => root.render(<I18nProvider><ArchiveView /></I18nProvider>));
  const input = browser.document.querySelector('input');
  if (!input) throw new Error('Archive search input missing');
  const setValue = Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value')?.set;
  if (!setValue) throw new Error('Input value setter missing');
  const search = async (query: string) => {
    await act(async () => {
      setValue.call(input, query);
      input.dispatchEvent(new browser.Event('input', { bubbles: true }));
      input.dispatchEvent(new browser.Event('change', { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    return [...document.querySelectorAll('[role="button"] > span:first-child')].map((row) => row.textContent);
  };
  expect(await search(id)).toEqual(['Release notes']);
  expect(await search(`  ${id.toUpperCase()}  `)).toEqual(['Release notes']);
  for (const query of ['ses_', 'ses_f88b', 'ses_f88b1a2b3c4f', `${id}x`, `${id} error`, 'ses_active']) {
    expect(await search(query)).toEqual([]);
  }
  expect(await search('release')).toEqual(['Release notes']);
  expect(await search('releaze')).toEqual(['Release notes']);
  expect(await search('')).toHaveLength(2);
});

test('archives Global sessions in one dedicated bucket and opens them with their returned directory', async () => {
  const globalSession = {
    ...session('ses_global', 'Global task'),
    projectID: 'global',
    directory: '/returned/global-directory',
  };
  useGlobalSessionsStore.setState({
    archivedSessions: [globalSession, session('ses_project', 'Project task')],
    activeSessions: [],
  });
  await act(async () => root.render(<I18nProvider><ArchiveView /></I18nProvider>));

  const globalBucket = [...document.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('global'));
  if (!globalBucket) throw new Error('Global archive bucket missing');
  await act(async () => globalBucket.click());

  const rows = [...document.querySelectorAll<HTMLElement>('[role="button"]')];
  expect(rows).toHaveLength(1);
  expect(rows[0]?.textContent).toContain('Global task');
  await act(async () => rows[0]?.click());
  expect(useSessionUIStore.getState().currentSessionId).toBe('ses_global');
  expect(useSessionUIStore.getState().currentSessionDirectory).toBe('/returned/global-directory');
});

test('keeps archived managed Chats out of the Global bucket and its bulk-delete request', async () => {
  const managedChat = {
    ...session('ses_managed', 'Archived managed Chat'),
    slug: 'ses_managed',
    projectID: 'global',
    directory: '/home/.config/openchamber/chats/2026-09-14/ses_managed',
    version: '1',
  };
  const globalSession = {
    ...session('ses_global', 'Archived Global task'),
    projectID: 'global',
    directory: '/returned/global-directory',
  };
  useGlobalSessionsStore.setState({
    archivedSessions: [managedChat, globalSession, session('ses_project', 'Project task')],
    activeSessions: [],
  });
  const deleteRequests: SessionDeleteRequest[] = [];
  const unsubscribe = sessionEvents.onDeleteRequest((request) => {
    deleteRequests.push(request);
  });

  try {
    await act(async () => root.render(<I18nProvider><ArchiveView /></I18nProvider>));

    expect(document.querySelector(
      'button[title="/home/.config/openchamber/chats/2026-09-14/ses_managed"]',
    )).not.toBeNull();
    const globalBucket = [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('global') && !button.getAttribute('aria-label'));
    if (!globalBucket) throw new Error('Global archive bucket missing');
    const globalBulkDelete = globalBucket.parentElement?.querySelector<HTMLButtonElement>('button[aria-label]');
    if (!globalBulkDelete) throw new Error('Global archive bulk-delete action missing');

    await act(async () => globalBulkDelete.click());
    expect(deleteRequests).toHaveLength(1);
    expect(deleteRequests[0]?.sessions.map((entry) => entry.id)).toEqual(['ses_global']);
    expect(deleteRequests[0]?.mode).toBe('session');

    await act(async () => globalBucket.click());
    const rows = [...document.querySelectorAll<HTMLElement>('[role="button"]')];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('Archived Global task');
    expect(rows[0]?.textContent).not.toContain('Archived managed Chat');
  } finally {
    unsubscribe();
  }
});
test('the chats of a deleted space are grouped under its name and cannot be restored', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(async () => new Response(JSON.stringify({
    archives: [{ spaceId: 'a1b2c3d4e5f6', name: 'Fix login', directory: '/data/spaces/archive/a1b2c3d4e5f6' }],
  }), { status: 200 }), originalFetch);
  try {
    useGlobalSessionsStore.setState({
      archivedSessions: [
        { ...session('ses_space1', 'Agent chat'), directory: '/data/spaces/archive/a1b2c3d4e5f6' },
        session('ses_mine1', 'My chat'),
      ],
      activeSessions: [],
    });
    await act(async () => root.render(<I18nProvider><ArchiveView /></I18nProvider>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const groups = [...document.querySelectorAll('.group\\/dir button[title]')].map((button) => button.textContent);
    expect(groups.some((label) => label?.startsWith('Fix login'))).toBe(true);
    expect(document.querySelector('[aria-label="Restore Agent chat"]')).toBeNull();
    expect(document.querySelector('[aria-label="Restore My chat"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Delete Agent chat"]')).not.toBeNull();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the mobile layout names each row\'s project, offers Restore without Delete, and leaves when a session opens', async () => {
  useGlobalSessionsStore.setState({
    archivedSessions: [session('ses_mobile1', 'Phone chat')],
    activeSessions: [],
  });
  let left = 0;
  await act(async () => root.render(
    <I18nProvider><ArchiveSessionsView layout="mobile" onLeave={() => { left += 1; }} /></I18nProvider>,
  ));
  expect(document.querySelector('.group\\/dir')).toBeNull();
  expect(document.querySelector('[aria-label="Restore Phone chat"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="Delete Phone chat"]')).toBeNull();
  const row = [...document.querySelectorAll('button')].find((button) => button.textContent?.startsWith('Phone chat'));
  if (!row) throw new Error('Archived session row missing');
  expect(row.textContent).toContain('workspace');
  await act(async () => { row.click(); });
  expect(left).toBe(1);
});

test('the page opens with the query the sidebar handed over, and a plain open starts fresh', async () => {
  useGlobalSessionsStore.setState({
    archivedSessions: [session('ses_a', 'Release notes'), session('ses_b', 'Login fix')],
    activeSessions: [],
    status: 'ready',
  });
  const titles = () => [...document.querySelectorAll('[role="button"] > span:first-child')].map((row) => row.textContent);
  useUIStore.getState().setArchivePageOpen(true, 'release');
  await act(async () => root.render(<I18nProvider><ArchiveView /></I18nProvider>));
  expect(browser.document.querySelector('input')?.value).toBe('release');
  expect(titles()).toEqual(['Release notes']);

  // A second handover while the page is already open replaces the query.
  await act(async () => { useUIStore.getState().setArchivePageOpen(true, 'login'); });
  expect(browser.document.querySelector('input')?.value).toBe('login');
  expect(titles()).toEqual(['Login fix']);

  await act(async () => { useUIStore.getState().setArchivePageOpen(false); });
  expect(browser.document.querySelector('input')).toBeNull();
  await act(async () => { useUIStore.getState().setArchivePageOpen(true); });
  expect(browser.document.querySelector('input')?.value).toBe('');
  expect(titles()).toHaveLength(2);
});

test('an empty archive is not reported before the session list has loaded, or after it failed to load', async () => {
  const emptyText = () => document.querySelector('p.font-semibold')?.textContent;
  useGlobalSessionsStore.setState({ archivedSessions: [], activeSessions: [], status: 'loading' });
  await act(async () => root.render(<I18nProvider><ArchiveView /></I18nProvider>));
  expect(emptyText()).toBe('Loading sessions…');
  await act(async () => { useGlobalSessionsStore.setState({ status: 'error' }); });
  expect(emptyText()).toBe('Could not refresh sessions.');
  await act(async () => { useGlobalSessionsStore.setState({ status: 'ready' }); });
  expect(emptyText()).toBe('No archived sessions');
});
