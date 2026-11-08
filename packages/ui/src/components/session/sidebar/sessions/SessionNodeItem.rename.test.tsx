import { expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import { I18nProvider } from '@/lib/i18n';
import type { SessionNodeItemProps } from './SessionNodeItem';

const syncContext = await import('@/sync/sync-context');
mock.module('@/sync/sync-context', () => ({
  ...syncContext,
  useSessionBlockingRequests: () => ({ hasPendingPermissions: false, hasPendingQuestions: false }),
}));
const aiRename = await import('@/sync/use-session-ai-rename');
mock.module('@/sync/use-session-ai-rename', () => ({
  ...aiRename,
  useIsSessionAiRenamePending: () => false,
}));
const sync = await import('@/sync/use-sync');
mock.module('@/sync/use-sync', () => ({
  ...sync,
  useSessionMessageRecordsForExport: () => async () => [],
  usePrefetchSessionMessages: () => () => undefined,
}));
const { SessionNodeItem } = await import('./SessionNodeItem');

for (const action of ['save', 'cancel'] as const) {
  test(`${action} SVG mousedown stays inside the owning rename form`, async () => {
    const win = new Window({ url: 'http://localhost/' });
    const globals = {
      window: win, document: win.document, navigator: win.navigator,
      Node: win.Node, Element: win.Element, HTMLElement: win.HTMLElement,
      HTMLIFrameElement: win.HTMLIFrameElement, Event: win.Event, MouseEvent: win.MouseEvent,
      CSS: win.CSS, getComputedStyle: win.getComputedStyle.bind(win),
      requestAnimationFrame: win.requestAnimationFrame.bind(win),
      cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
      ResizeObserver: win.ResizeObserver, IS_REACT_ACT_ENVIRONMENT: true,
    };
    const descriptors = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    Object.assign(globalThis, globals);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const saves: Array<string | undefined> = [];
    let cancels = 0;
    const noop = () => undefined;
    const rowKey = 'project:session:owner';
    const props: SessionNodeItemProps = {
      node: {
        session: {
          id: 'owner', projectID: 'project', title: 'Old title', directory: '/workspace', cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          time: { created: 1, updated: 1 },
        },
        children: [], worktree: null,
      },
      ownsWork: false, rowKey, groupDirectory: '/workspace',
      pinnedSessionIds: new Set(), expandedParents: new Set(),
      hasSessionSearchQuery: false, normalizedSessionSearchQuery: '',
      editingId: 'owner', editingRowKey: rowKey, editTitle: 'New title', openSidebarMenuKey: null,
      setEditingId: noop, setEditingRowKey: noop, setEditTitle: noop,
      handleSaveEdit: (title) => { saves.push(title); },
      handleCancelEdit: () => { cancels += 1; },
      toggleParent: noop, handleSessionSelect: noop, handleSessionDoubleClick: noop, handleCopySessionId: noop,
      setOpenSidebarMenuKey: noop, createFolderAndStartRename: () => null,
      handleDeleteSession: noop, handleRestoreSession: noop,
      startSessionWorktreeMenuLoad: () => ({ cachedTargets: [], refreshTargets: Promise.resolve([]) }),
      mobileVariant: false, alwaysShowActions: false,
      subtreeContainsEditing: new Set(), menuOpenSessionId: null, nodeStructureKey: '',
    };
    try {
      await act(async () => root.render(<I18nProvider><SessionNodeItem {...props} /></I18nProvider>));
      const form = host.querySelector('form');
      const button = form?.querySelector(`button[type="${action === 'save' ? 'submit' : 'button'}"]`);
      const icon = button?.querySelector('svg use');
      expect(form?.getAttribute('data-session-rename-form')).toBe(rowKey);
      expect(icon).toBeInstanceOf(win.SVGElement);
      expect(icon instanceof win.HTMLElement).toBe(false);
      await act(async () => { icon!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
      expect(saves).toEqual([]);
      expect(cancels).toBe(0);
      await act(async () => {
        if (action === 'save') form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        else icon!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(saves).toEqual(action === 'save' ? ['New title'] : []);
      expect(cancels).toBe(action === 'cancel' ? 1 : 0);

      const otherForm = document.createElement('form');
      otherForm.setAttribute('data-session-rename-form', 'recent:session:owner');
      const otherIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      otherForm.appendChild(otherIcon);
      document.body.appendChild(otherForm);
      await act(async () => { otherIcon.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
      expect(saves).toEqual(action === 'save' ? ['New title', 'New title'] : ['New title']);
    } finally {
      await act(async () => root.unmount());
      await win.happyDOM.close();
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    }
  });
}
