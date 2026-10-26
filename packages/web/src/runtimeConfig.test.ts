import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

vi.mock('@openchamber/ui/lib/runtime-auth', () => ({
  getRuntimeBearerTokenSync: vi.fn(() => ''),
  getRuntimeExtraHeadersSync: vi.fn(() => ({})),
  refreshLocalRuntimeUrlAuthToken: vi.fn(() => Promise.resolve()),
  refreshRuntimeUrlAuthToken: vi.fn(() => Promise.resolve()),
  setRuntimeBearerToken: vi.fn(),
  setRuntimeExtraHeaders: vi.fn(),
}));
vi.mock('@openchamber/ui/lib/runtime-fetch', () => ({ installRuntimeFetchBridge: vi.fn() }));
vi.mock('@openchamber/ui/lib/runtime-switch', () => ({
  getRuntimeApiBaseUrl: vi.fn(() => ''),
  getRuntimeKey: vi.fn(() => 'local'),
  initializeRuntimeEndpoint: vi.fn(),
  switchRuntimeEndpoint: vi.fn(),
}));
vi.mock('@openchamber/ui/lib/desktopRuntimeRestore', () => ({ restoreDesktopRuntime: vi.fn(() => Promise.resolve()) }));
vi.mock('@openchamber/ui/lib/runtime-url', () => ({ configureRuntimeUrlResolver: vi.fn(() => ({})) }));
vi.mock('@openchamber/ui/lib/opencode/client', () => ({ opencodeClient: { reconnectToRuntimeBaseUrl: vi.fn() } }));
vi.mock('./api', () => ({ createWebAPIs: vi.fn() }));

import { initializeRuntimeEndpoint } from '@openchamber/ui/lib/runtime-switch';
import { restoreDesktopRuntime } from '@openchamber/ui/lib/desktopRuntimeRestore';
import { createConfiguredWebAPIs, getDesktopRuntimeRestoreReady, readRuntimeBootstrapConfig } from './runtimeConfig';

const originalWindow = globalThis.window;

const installWindow = (value: Record<string, unknown>) => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value,
  });
};

const makeWindow = (search = ''): Record<string, unknown> => {
  const value: Record<string, unknown> = {
    location: { origin: 'openchamber-ui://app', search },
    setTimeout: vi.fn(() => 1),
  };
  value.parent = value;
  return value;
};

beforeEach(() => {
  vi.clearAllMocks();
  installWindow(makeWindow());
});

afterAll(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  });
});

describe('readRuntimeBootstrapConfig', () => {
  test('reads the runtime injected into the current window', () => {
    const current = makeWindow();
    current.__OPENCHAMBER_API_BASE_URL__ = ' https://remote.example.com ';
    current.__OPENCHAMBER_CLIENT_TOKEN__ = ' remote-token ';
    current.__OPENCHAMBER_LOCAL_ORIGIN__ = ' http://127.0.0.1:3000 ';
    current.__OPENCHAMBER_RUNTIME_HEADERS__ = { 'x-openchamber-relay': 'relay-value' };
    current.__OPENCHAMBER_RELAY_HOST_ID__ = ' remote-host ';
    installWindow(current);

    expect(readRuntimeBootstrapConfig()).toEqual({
      apiBaseUrl: 'https://remote.example.com',
      clientToken: 'remote-token',
      localOrigin: 'http://127.0.0.1:3000',
      runtimeHeaders: { 'x-openchamber-relay': 'relay-value' },
      relayHostId: 'remote-host',
      explicitRuntime: false,
    });
  });

  test('does not read runtime credentials directly from a parent window', () => {
    const parent = makeWindow();
    parent.__OPENCHAMBER_API_BASE_URL__ = 'https://remote.example.com';
    parent.__OPENCHAMBER_CLIENT_TOKEN__ = 'remote-token';
    const child = makeWindow();
    child.parent = parent;
    installWindow(child);

    expect(readRuntimeBootstrapConfig()).toEqual({
      apiBaseUrl: '',
      clientToken: '',
      localOrigin: '',
      runtimeHeaders: undefined,
      relayHostId: '',
      explicitRuntime: false,
    });
  });
});

describe('createConfiguredWebAPIs', () => {
  test('readiness stays pending until the desktop restore finishes', async () => {
    let finishRestore!: () => void;
    vi.mocked(restoreDesktopRuntime).mockReturnValueOnce(new Promise<void>((resolve) => { finishRestore = resolve; }));
    const settled = vi.fn();
    vi.useFakeTimers();
    try {
      createConfiguredWebAPIs();
      const ready = getDesktopRuntimeRestoreReady().then(settled);
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).not.toHaveBeenCalled();
      finishRestore();
      await ready;
      expect(settled).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });

  test('the actual main start sequence mounts only after saved-default readiness', async () => {
    let finishRestore!: () => void;
    vi.mocked(restoreDesktopRuntime).mockReturnValueOnce(new Promise<void>((resolve) => { finishRestore = resolve; }));
    const source = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
    const start = source.indexOf('const start = async (): Promise<void> => {');
    expect(start).toBeGreaterThan(-1);
    const sequence = source.slice(start, source.indexOf('\n};', start) + 4)
      .replace(': Promise<void>', '')
      .replace("import('@openchamber/ui/main')", 'mountDesktop()')
      .replace("import('@openchamber/ui/apps/renderMobileApp')", 'mountMobile()');
    const mountDesktop = vi.fn(async () => ({}));
    const mountMobile = vi.fn();
    vi.useFakeTimers();
    try {
      const running: Promise<void> = runInNewContext(`${sequence}; start();`, {
        window, hostedSurface: 'desktop', createConfiguredWebAPIs, getDesktopRuntimeRestoreReady,
        watchHostedSurfaceViewport: vi.fn(), mountDesktop, mountMobile,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(mountDesktop).not.toHaveBeenCalled();
      finishRestore();
      await running;
      expect(mountDesktop).toHaveBeenCalledOnce();
      expect(mountMobile).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  test('uses the configured desktop host id across changing SSH tunnel URLs', () => {
    const current = makeWindow();
    current.__OPENCHAMBER_DESKTOP_BOOT_OUTCOME__ = {
      target: 'remote',
      status: 'ok',
      hostId: 'ssh-castle',
      url: 'http://127.0.0.1:62545',
      localAvailable: true,
    };
    current.__OPENCHAMBER_API_BASE_URL__ = 'http://127.0.0.1:62545';
    current.__OPENCHAMBER_LOCAL_ORIGIN__ = 'http://127.0.0.1:3901';
    installWindow(current);

    createConfiguredWebAPIs();

    expect(initializeRuntimeEndpoint).toHaveBeenCalledWith({
      apiBaseUrl: 'http://127.0.0.1:62545',
      runtimeKey: 'host:ssh-castle',
    });
  });

  test('a window opened for an explicit instance keeps its runtime instead of the default host', () => {
    const current = makeWindow();
    current.__OPENCHAMBER_API_BASE_URL__ = 'http://127.0.0.1:3901';
    current.__OPENCHAMBER_LOCAL_ORIGIN__ = 'http://127.0.0.1:3901';
    current.__OPENCHAMBER_EXPLICIT_RUNTIME__ = true;
    installWindow(current);

    createConfiguredWebAPIs();

    expect(restoreDesktopRuntime).not.toHaveBeenCalled();
  });

  test('a relay-capable explicit window still restores through its injected host id', () => {
    const current = makeWindow();
    current.__OPENCHAMBER_API_BASE_URL__ = 'http://127.0.0.1:3901';
    current.__OPENCHAMBER_LOCAL_ORIGIN__ = 'http://127.0.0.1:3901';
    current.__OPENCHAMBER_RELAY_HOST_ID__ = 'relay-host';
    current.__OPENCHAMBER_EXPLICIT_RUNTIME__ = true;
    installWindow(current);

    createConfiguredWebAPIs();

    expect(restoreDesktopRuntime).toHaveBeenCalledWith('relay-host', { reconnectActive: true });
  });

  test('the main window still restores the default host', () => {
    const current = makeWindow();
    current.__OPENCHAMBER_API_BASE_URL__ = 'http://127.0.0.1:3901';
    current.__OPENCHAMBER_LOCAL_ORIGIN__ = 'http://127.0.0.1:3901';
    installWindow(current);

    createConfiguredWebAPIs();

    expect(restoreDesktopRuntime).toHaveBeenCalledWith();
  });

  test('an environment-selected instance keeps its runtime instead of the saved default', () => {
    const current = makeWindow();
    current.__OPENCHAMBER_API_BASE_URL__ = 'https://forced.example.com';
    current.__OPENCHAMBER_DESKTOP_BOOT_OUTCOME__ = {
      target: 'remote', status: 'ok', hostId: '__env', url: 'https://forced.example.com',
    };
    installWindow(current);

    createConfiguredWebAPIs();

    expect(restoreDesktopRuntime).not.toHaveBeenCalled();
  });
});
