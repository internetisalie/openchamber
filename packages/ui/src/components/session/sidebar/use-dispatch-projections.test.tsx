import { expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import { getRuntimeKey } from '@/lib/runtime-switch';
import type { FilesAPI } from '@/lib/api/types';
import { createWebAPIs } from '../../../../../web/src/api';
import { installHookTestDom } from './test-utils/testDom';
import { dispatchSessionKey, type WorkspaceDispatchAttribution } from './dispatch-projection';
import { useDispatchProjections } from './use-dispatch-projections';

test('visible scope owns reads, ignores obsolete directory completions, and does not reread identical demand', async () => {
  const dom = installHookTestDom();
  const root = createRoot(dom.container);
  const source = getRuntimeKey();
  const pending: { directory: string; signal?: AbortSignal; resolve: () => void }[] = [];
  const readNativeFile: NonNullable<FilesAPI['readNativeFile']> = (path, options) => new Promise((resolve) => {
    pending.push({ directory: options.directory, signal: options.signal, resolve: () => resolve({ status: 'read', content: JSON.stringify({
      schema: 'loom.dispatch-projection.v1', status: 'missing', workspace: options.directory,
      ...(path.includes('session-projection/') ? { sessionID: path.split('/').pop()!.slice(0, -5) } : {}),
    }) }) });
  });
  const apis = createWebAPIs();
  const files = { ...apis.files, readNativeFile };
  let latest: WorkspaceDispatchAttribution = { status: 'unsupported' };
  function Harness({ directory, enabled }: { directory: string; enabled: boolean }) {
    latest = useDispatchProjections(source, [{ id: 'ses_one', directory }], enabled);
    return null;
  }
  const render = (directory: string, enabled: boolean) => root.render(
    <RuntimeAPIContext.Provider value={{ ...apis, files: { ...files } }}><Harness directory={directory} enabled={enabled} /></RuntimeAPIContext.Provider>,
  );
  const result = (): WorkspaceDispatchAttribution => latest;
  try {
    await act(async () => render('/first', false));
    expect(pending).toHaveLength(0);
    await act(async () => render('/first', true));
    expect(pending).toHaveLength(2);
    await act(async () => render('/second/checkout', true));
    expect(pending).toHaveLength(4);
    expect(pending.slice(0, 2).every((request) => request.signal?.aborted)).toBe(true);
    expect(pending.slice(2).map((request) => request.directory)).toEqual(['/second/checkout', '/second/checkout']);
    await act(async () => { pending[0].resolve(); pending[1].resolve(); });
    const obsolete = result();
    expect(obsolete.status === 'scoped' && obsolete.workspaces.has('/first')).toBe(false);
    await act(async () => { pending[2].resolve(); pending[3].resolve(); });
    const complete = result();
    if (complete.status !== 'scoped') throw new Error('Scoped result required');
    expect(complete.sessions.get(dispatchSessionKey('/second/checkout', 'ses_one'))).toMatchObject({ status: 'missing' });
    await act(async () => render('/second/checkout', true));
    expect(pending).toHaveLength(4);
    await act(async () => render('/second/checkout', false));
    const hidden = result();
    if (hidden.status !== 'scoped') throw new Error('Scoped hidden state required');
    expect(hidden.sessions.get(dispatchSessionKey('/second/checkout', 'ses_one'))).toEqual({ status: 'unrequested' });
    expect(pending).toHaveLength(4);
  } finally {
    await act(async () => root.unmount());
    dom.restore();
  }
});
