import React, { act } from 'react';
import { expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { GiteaAPI, GiteaItem, GiteaRepository } from '@/lib/api/types';

let selectedFolder = '';
const selectNestedRepo = (_root: string, folder: string) => { selectedFolder = folder; };
const ensureNestedRepos = async () => undefined;
const repos = {
  origin: { instanceUrl: 'https://one.example', owner: 'team', name: 'project', remote: 'origin' },
  upstream: { instanceUrl: 'https://two.example', owner: 'team', name: 'project', remote: 'upstream' },
} satisfies Record<'origin' | 'upstream', GiteaRepository>;
const repoFor = (remote: string): GiteaRepository => {
  const repo = Object.values(repos).find((candidate) => candidate.remote === remote);
  if (!repo) throw new Error(`Unexpected test remote: ${remote}`);
  return repo;
};
const item = (remote: string, kind: GiteaItem['kind'], number: number): GiteaItem => ({
  kind, number, title: `${remote} item ${number}`, body: '', state: 'open', author: 'alice',
  url: `${repoFor(remote).instanceUrl}/team/project/${kind === 'pr' ? 'pulls' : 'issues'}/${number}`,
});
const calls: Array<{ remote: string; kind: GiteaItem['kind']; page: number; query: string }> = [];
let finishOrigin!: (value: Awaited<ReturnType<GiteaAPI['items']>>) => void;
const originPending = new Promise<Awaited<ReturnType<GiteaAPI['items']>>>((resolve) => { finishOrigin = resolve; });
let selection: { instanceUrl: string; repo: string; id: string; contextText: string } | null = null;
let diffRepo: GiteaRepository | undefined;

const gitea = {
  repository: async (_directory: string, remote: string) => Object.values(repos)
    .find((candidate) => candidate.remote === remote) ?? null,
  items: async (_directory: string, kind: GiteaItem['kind'], options: { remote: string; page?: number; query?: string }) => {
    const remote = options.remote;
    const page = options.page ?? 1;
    const query = options.query ?? '';
    calls.push({ remote, kind, page, query });
    if (remote === 'origin') return originPending;
    return { repo: repoFor(remote), items: [item(remote, kind, page === 1 ? 7 : 8)], page,
      hasMore: page === 1 };
  },
  item: async (_directory: string, kind: GiteaItem['kind'], number: number, remote: string) => ({
    repo: repoFor(remote), item: item(remote, kind, number), pull: null, comments: [], commentsTruncated: false,
  }),
  pullDiff: async (_directory: string, _number: number, _remote: string, expectedRepo: GiteaRepository) => {
    diffRepo = expectedRepo;
    return 'diff --git a/file b/file';
  },
};

mock.module('@/hooks/useRuntimeAPIs', () => ({ useRuntimeAPIs: () => ({ gitea }) }));
mock.module('@/hooks/useEffectiveDirectory', () => ({ useEffectiveDirectory: () => '/workspace' }));
mock.module('@/hooks/useNestedGitDirectory', () => ({ useNestedGitDirectory: () => ({
  rootIsGitRepo: false, gitDirectory: '/workspace/loom', nestedRepos: ['/workspace/loom', '/workspace/loom-base'],
}) }));
mock.module('@/stores/useGitStore', () => ({ useGitStore: <T,>(selector: (state: {
  selectNestedRepo: typeof selectNestedRepo; ensureNestedRepos: typeof ensureNestedRepos;
}) => T) => selector({ selectNestedRepo, ensureNestedRepos }) }));
mock.module('@/lib/gitApi', () => ({ getRemotes: async () => [
  { name: 'origin' }, { name: 'upstream' },
] }));
mock.module('@/components/views/git/NestedRepoPicker', () => ({
  NestedRepoPicker: ({ onSelectRepository }: { onSelectRepository: (folder: string) => void }) =>
    <button type="button" data-folder-picker onClick={() => onSelectRepository('/workspace/loom-base')}>Folder picker</button>,
}));
mock.module('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: React.PropsWithChildren<{ open: boolean }>) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
  DialogDescription: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
}));
mock.module('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
mock.module('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));
mock.module('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange, ariaLabel }: { checked: boolean; onChange: (value: boolean) => void; ariaLabel: string }) =>
    <input type="checkbox" checked={checked} aria-label={ariaLabel} onChange={(event) => onChange(event.target.checked)} />,
}));
mock.module('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: React.PropsWithChildren<{ value: string; onValueChange: (value: string) => void }>) =>
    <select value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
  SelectContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
  SelectItem: ({ children, value }: React.PropsWithChildren<{ value: string }>) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));
test('picker shares folder choice, isolates remote search and paging, and attaches the selected PR', async () => {
  const dom = new Window({ url: 'http://localhost' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const globals = { window: dom, document: dom.document, localStorage: dom.localStorage,
    Event: dom.Event, HTMLElement: dom.HTMLElement,
    Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true };
  for (const [name, value] of Object.entries(globals)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import('react-dom/client');
  const { I18nProvider } = await import('@/lib/i18n');
  const { GiteaPickerDialog } = await import('./gitea-picker-dialog');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const wait = async (ms = 20) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
  try {
    await act(async () => root.render(<I18nProvider><GiteaPickerDialog open
      onOpenChange={() => undefined} onSelect={(value) => { selection = value; }} /></I18nProvider>));
    await wait();
    expect(container.querySelector('[data-folder-picker]')).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('[data-folder-picker]')?.click());
    expect(selectedFolder).toBe('/workspace/loom-base');
    const remoteSelect = container.querySelector('select');
    if (!remoteSelect) throw new Error('Expected a remote selector');
    expect(remoteSelect.options.length).toBe(2);
    expect(remoteSelect.textContent).toContain('https://two.example/team/project');
    await act(async () => {
      remoteSelect.value = 'upstream';
      remoteSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await wait();
    finishOrigin({ repo: repos.origin, items: [item('origin', 'issue', 3)], page: 1, hasMore: false });
    await wait();
    expect(container.textContent).toContain('upstream item 7');
    expect(container.textContent).not.toContain('origin item 3');

    const prButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Pull requests');
    await act(async () => prButton?.click());
    await wait();
    const search = container.querySelector<HTMLInputElement>('input[aria-label="Search issues or pull requests"]');
    expect(search).not.toBeNull();
    await act(async () => {
      if (!search) return;
      Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, 'value')?.set?.call(search, 'fix');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await wait(350);
    expect(calls.some((call) => call.remote === 'upstream' && call.kind === 'pr' && call.query === 'fix')).toBe(true);
    const more = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Load more');
    await act(async () => more?.click());
    expect(calls.some((call) => call.remote === 'upstream' && call.kind === 'pr' && call.page === 2 && call.query === 'fix')).toBe(true);
    expect(container.textContent).toContain('upstream item 8');

    const number = container.querySelector<HTMLInputElement>('input[inputmode="numeric"]');
    await act(async () => {
      if (!number) return;
      Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, 'value')?.set?.call(number, '#42');
      number.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const useNumber = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Use number');
    await act(async () => useNumber?.click());
    expect(container.textContent).toContain('upstream item 42');
    const diffCheckbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    await act(async () => diffCheckbox?.click());
    const attach = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Attach to chat');
    await act(async () => attach?.click());
    expect(selection?.instanceUrl).toBe('https://two.example');
    expect(selection?.repo).toBe('project');
    expect(selection?.id).toBe('42');
    expect(selection?.contextText).toContain('diff --git');
    expect(diffRepo).toEqual(repos.upstream);
  } finally {
    await act(async () => root.unmount());
    dom.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
