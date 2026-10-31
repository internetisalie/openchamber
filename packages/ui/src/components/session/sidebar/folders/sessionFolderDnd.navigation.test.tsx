import { afterAll, afterEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost/' });
const descriptors = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: browser, document: browser.document, navigator: browser.navigator,
  HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node,
  Event: browser.Event, MouseEvent: browser.MouseEvent, KeyboardEvent: browser.KeyboardEvent,
  MutationObserver: browser.MutationObserver, getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser), IS_REACT_ACT_ENVIRONMENT: true,
})) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

const { createRoot } = await import('react-dom/client');
const { DraggableSessionRow, SessionFolderDndScope, SessionFolderOwnersProvider } = await import('./sessionFolderDnd');
let root: Root | null = null;
let host: HTMLDivElement;
const selections: string[] = [];

afterEach(async () => {
  await act(() => root?.unmount());
  root = null;
  host?.remove();
  selections.length = 0;
});
afterAll(async () => {
  await browser.happyDOM.abort();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

const mount = async (ownerKeys: string[], archivedBucket = false, navigationDisabled = false) => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(() => root!.render(
    <SessionFolderDndScope scopeKey="/workspace" ownerKey="project-a" hasFolders={ownerKeys.length > 0} onSessionDroppedOnFolder={() => undefined}>
      <SessionFolderOwnersProvider ownerKeys={ownerKeys}>
        <DraggableSessionRow sessionId="feature-session" ownerKey="project-a" sessionDirectory="/workspace/feature" sessionTitle="Feature session" archivedBucket={archivedBucket}>
          <button disabled={navigationDisabled} onClick={() => selections.push('feature-session')}>Open feature session</button>
        </DraggableSessionRow>
      </SessionFolderOwnersProvider>
    </SessionFolderDndScope>,
  ));
  const navigation = host.querySelector<HTMLButtonElement>('button')!;
  return { navigation, wrapper: navigation.parentElement! };
};

test('a mounted row with no folder target permits navigation without inherited drag-disabled semantics', async () => {
  const { navigation, wrapper } = await mount([]);
  expect(navigation.closest('[aria-disabled="true"]')).toBeNull();
  expect(wrapper.hasAttribute('role')).toBe(false);
  expect(wrapper.hasAttribute('aria-roledescription')).toBe(false);
  expect(wrapper.hasAttribute('aria-describedby')).toBe(false);
  expect(wrapper.hasAttribute('tabindex')).toBe(false);
  await act(() => navigation.click());
  expect(selections).toEqual(['feature-session']);
});

test('a mounted draggable row retains real dnd-kit accessibility and normal navigation', async () => {
  const { navigation, wrapper } = await mount(['project-a']);
  expect(wrapper.getAttribute('role')).toBe('button');
  expect(wrapper.getAttribute('aria-disabled')).toBe('false');
  expect(wrapper.getAttribute('aria-roledescription')).toBe('draggable');
  expect(wrapper.getAttribute('aria-describedby')?.startsWith('DndDescribedBy-')).toBe(true);
  expect(wrapper.getAttribute('tabindex')).toBe('0');
  await act(() => navigation.click());
  expect(selections).toEqual(['feature-session']);
});

test('archived drag refusal does not disable an otherwise permitted navigation child', async () => {
  const { navigation, wrapper } = await mount(['project-a'], true);
  expect(navigation.closest('[aria-disabled="true"]')).toBeNull();
  expect(wrapper.hasAttribute('aria-roledescription')).toBe(false);
  await act(() => navigation.click());
  expect(selections).toEqual(['feature-session']);
});

test('a row with a folder target still activates and ends a real mouse-sensor drag', async () => {
  const { navigation, wrapper } = await mount(['project-a']);
  await act(() => { navigation.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 1, clientY: 1 })); });
  await act(() => { document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 30, clientY: 1 })); });
  expect(wrapper.getAttribute('aria-pressed')).toBe('true');
  expect(wrapper.classList.contains('opacity-30')).toBe(true);
  await act(async () => {
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  expect(wrapper.hasAttribute('aria-pressed')).toBe(false);
  expect(wrapper.classList.contains('opacity-30')).toBe(false);
});

test('omitting inapplicable drag semantics preserves a genuinely disabled navigation control', async () => {
  const { navigation } = await mount([], false, true);
  expect(navigation.disabled).toBe(true);
  await act(() => navigation.click());
  expect(selections).toEqual([]);
});
