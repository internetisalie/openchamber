import { expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { Window } from 'happy-dom';
import type { SessionMessageRecord } from '@/lib/exportSession';
import type { Session } from '@/lib/opencode/model';

const browser = new Window({ url: 'http://localhost' });
const globals = {
  window: browser, document: browser.document, navigator: browser.navigator,
  localStorage: browser.localStorage,
  Element: browser.Element, HTMLElement: browser.HTMLElement, HTMLIFrameElement: browser.HTMLIFrameElement,
  Node: browser.Node, Event: browser.Event, CustomEvent: browser.CustomEvent,
  MutationObserver: browser.MutationObserver, getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
};
const descriptors = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });

const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { useGlobalSessionsStore } = await import('@/stores/useGlobalSessionsStore');
const sync = await import('@/sync/use-sync');
const { useSessionMarkdownExport } = await import('./useSessionMarkdownExport');

const session = (id: string, directory: string, parentID?: string): Session => ({
  id, directory, parentID, projectID: 'project', title: id, cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 1 },
});

test('the Markdown export dialog includes the parent, child and grandchild from their own directories', async () => {
  const parent = session('ses_parent', '/parent');
  const child = session('ses_child', '/child', parent.id);
  const grandchild = session('ses_grandchild', '/grandchild', child.id);
  const transcripts = new Map([
    ['ses_parent', { directory: '/parent', text: 'Plan the deployment' }],
    ['ses_child', { directory: '/child', text: 'Check the migration' }],
    ['ses_grandchild', { directory: '/grandchild', text: 'Verify the backup restored' }],
  ]);
  const loads: { directory: string; sessionID: string }[] = [];
  const load = async ({ directory, sessionID }: { directory: string; sessionID: string }): Promise<SessionMessageRecord[]> => {
    loads.push({ directory, sessionID });
    const transcript = transcripts.get(sessionID);
    if (transcript?.directory !== directory) throw new Error(`No history for ${sessionID} in ${directory}`);
    const messageID = `${sessionID}_message`;
    return [{
      info: { id: messageID, sessionID, role: 'user', time: { created: 1 } },
      parts: [{ id: `${messageID}_part`, messageID, sessionID, type: 'text', text: transcript.text }],
    }];
  };
  const loader = spyOn(sync, 'useSessionMessageRecordsForExport');
  loader.mockReturnValue(load);
  const download = spyOn(browser.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const urls = spyOn(URL, 'createObjectURL');
  const originalSessions = useGlobalSessionsStore.getState();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function ExportMenu() {
    const { requestExport, dialog } = useSessionMarkdownExport();
    return <><button onClick={() => requestExport(parent, '/parent')}>Export as Markdown</button>{dialog}</>;
  }
  try {
    useGlobalSessionsStore.getState().applySnapshot([parent, child, grandchild], []);
    await act(async () => root.render(<I18nProvider><ExportMenu /></I18nProvider>));
    await act(async () => host.querySelector('button')?.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    const confirm = [...dialog?.querySelectorAll('button') ?? []].find((button) => button.textContent === 'Export');
    if (!confirm) throw new Error('Export confirmation button missing');
    await act(async () => confirm.click());

    expect(download).toHaveBeenCalledTimes(1);
    expect(urls).toHaveBeenCalledTimes(1);
    const blob = urls.mock.calls[0]?.[0];
    if (!(blob instanceof Blob)) throw new Error('Markdown download did not contain a Blob');
    const markdown = await blob.text();
    expect(markdown).toContain('Plan the deployment');
    expect(markdown).toContain('Check the migration');
    expect(markdown).toContain('Verify the backup restored');
    expect(loads).toEqual([
      { directory: '/parent', sessionID: 'ses_parent' },
      { directory: '/child', sessionID: 'ses_child' },
      { directory: '/grandchild', sessionID: 'ses_grandchild' },
    ]);
  } finally {
    await act(async () => root.unmount());
    loader.mockRestore();
    download.mockRestore();
    urls.mockRestore();
    useGlobalSessionsStore.setState(originalSessions, true);
    await browser.happyDOM.close();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
