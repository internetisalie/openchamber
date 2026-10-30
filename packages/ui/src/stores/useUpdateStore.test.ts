import { afterEach, describe, expect, test } from 'bun:test';
import { parseUpdateCheckResponse, useUpdateStore } from './useUpdateStore';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; useUpdateStore.getState().reset(); });

describe('fork-only update state', () => {
  test('forces manual installation and constructs fork links for older remote servers', () => {
    const info = parseUpdateCheckResponse({ available: true, version: '2.4.0-internetisalie.3', releaseUrl: 'https://upstream.invalid', updateCommand: 'npm install -g @openchamber/web', installBlocked: undefined });
    expect(info.installBlocked).toBe('manual-install');
    expect(info.releaseUrl).toBe('https://github.com/internetisalie/openchamber/releases/tag/v2.4.0-internetisalie.3');
    expect(info.updateCommand).toBeUndefined();
  });
  test('rejects upstream metadata and unknown availability', () => {
    expect(() => parseUpdateCheckResponse({ available: true, version: '2.4.1' })).toThrow();
    expect(() => parseUpdateCheckResponse({ available: null })).toThrow();
  });
  test('cached downloaded state cannot trigger installation or restart', async () => {
    for (const runtimeType of ['desktop', 'web', 'vscode', 'mobile'] as const) {
      useUpdateStore.setState({ downloaded: true, available: true, runtimeType });
      await expect(useUpdateStore.getState().downloadUpdate()).rejects.toThrow('disabled');
      await expect(useUpdateStore.getState().restartToUpdate()).rejects.toThrow('disabled');
    }
    useUpdateStore.getState().reset();
  });
  test('failed checks preserve the last known fork release and expose the error', async () => {
    const info = parseUpdateCheckResponse({ available: true, version: '2.4.0-internetisalie.4' });
    useUpdateStore.setState({ info, available: true });
    globalThis.fetch = async () => new Response('', { status: 503 });
    await useUpdateStore.getState().checkForUpdates();
    expect(useUpdateStore.getState().info).toEqual(info);
    expect(useUpdateStore.getState().available).toBe(true);
    expect(useUpdateStore.getState().error).not.toBeNull();
    expect(useUpdateStore.getState().checking).toBe(false);
  });
  test('dismiss discards obsolete install state without invoking an installer', () => {
    const info = parseUpdateCheckResponse({ available: true, version: '2.4.0-internetisalie.4' });
    useUpdateStore.setState({ available: true, downloaded: true, installing: true, info, progress: { downloaded: 10, total: 20 } });
    useUpdateStore.getState().dismiss();
    expect(useUpdateStore.getState()).toMatchObject({ available: false, downloaded: false, installing: false, info: null, progress: null });
  });
});
