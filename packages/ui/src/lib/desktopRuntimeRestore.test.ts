import { describe, expect, test } from 'bun:test';
import { restoreDesktopRuntime } from './desktopRuntimeRestore';
import { desktopHostsGet, type HostProbeResult } from './desktopHosts';
import type { DesktopBootOutcome } from './desktopBoot';
import { adoptRelayTunnel, deactivateRelayTunnel, getActiveRelayTunnel } from './relay/runtime-tunnel';
import { clearRuntimeUrlAuthToken, getRuntimeBearerTokenSync, getRuntimeExtraHeadersSync, refreshRuntimeUrlAuthToken, setRuntimeBearerToken, setRuntimeExtraHeaders } from './runtime-auth';
import { runtimeFetch } from './runtime-fetch';
import { getRuntimeApiBaseUrl, getRuntimeKey, isSshForwardedRuntime, subscribeRuntimeEndpointChanged, switchRuntimeEndpoint } from './runtime-switch';

const startupA = 'https://runtime-a.test';
const savedB = 'https://runtime-b.test/chamber';
const localOrigin = 'http://127.0.0.1:3000';
const savedConfig = (defaultHostId: string | null = 'b'): Awaited<ReturnType<typeof desktopHostsGet>> => ({
  hosts: [{ id: 'b', label: 'B', url: savedB, clientToken: 'oc_client_fixture_b', requestHeaders: { 'X-Fixture-Host': 'b' } }],
  defaultHostId,
  initialHostChoiceCompleted: true,
  localOrigin,
});

const withReloadedDesktop = async (
  config: Awaited<ReturnType<typeof desktopHostsGet>>,
  run: (requests: Request[], commands: string[]) => Promise<void>,
  options: {
    electron?: boolean;
    failRead?: boolean;
    bootOutcome?: DesktopBootOutcome;
    initialUrl?: string;
    initialKey?: string;
    probeStatus?: 'ok' | 'unreachable' | 'wrong-service' | 'incompatible';
    probe?: () => Promise<HostProbeResult>;
  } = {},
) => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousFetch = globalThis.fetch;
  const requests: Request[] = [];
  const commands: string[] = [];
  const events = new EventTarget();
  const runtimeWindow = {
    location: { origin: 'openchamber-ui://app', href: 'openchamber-ui://app/index.html?session=b-session' },
    __OPENCHAMBER_ELECTRON__: { runtime: options.electron === false ? 'web' : 'electron' },
    __OPENCHAMBER_LOCAL_ORIGIN__: config.localOrigin,
    __OPENCHAMBER_DESKTOP_BOOT_OUTCOME__: options.bootOutcome ?? { target: 'remote', status: 'ok', hostId: 'a', url: startupA },
    __OPENCHAMBER_DESKTOP__: {
      invoke: async (command: string) => {
        commands.push(command);
        if (command === 'desktop_hosts_get') {
          if (options.failRead) throw new Error('config unavailable');
          return config;
        }
        if (command === 'desktop_local_client_token_get') return 'oc_client_fixture_local';
        if (command === 'desktop_host_probe') return options.probe ? options.probe() : { status: options.probeStatus ?? 'ok', latencyMs: 1 };
        throw new Error(`unexpected desktop command: ${command}`);
      },
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  };
  Object.defineProperties(runtimeWindow, {
    __OPENCHAMBER_API_BASE_URL__: { value: startupA, writable: false },
    __OPENCHAMBER_CLIENT_TOKEN__: { value: 'oc_client_fixture_a', writable: false },
    __OPENCHAMBER_RUNTIME_HEADERS__: { value: { 'X-Fixture-Host': 'a' }, writable: false },
  });
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: runtimeWindow });
    globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      if (new URL(request.url).pathname.endsWith('/auth/url-token')) {
        return Response.json({ token: 'fixture_runtime_url_token', expiresAt: Date.now() + 60_000 });
      }
      return new Response(null, { status: 404 });
    }, { preconnect: async () => {} });
    switchRuntimeEndpoint({ apiBaseUrl: options.initialUrl ?? startupA, runtimeKey: options.initialKey ?? 'host:a', clientToken: 'oc_client_fixture_a', requestHeaders: { 'X-Fixture-Host': 'a' } });
    await refreshRuntimeUrlAuthToken(options.initialUrl ?? startupA).catch(() => {});
    await run(requests, commands);
  } finally {
    clearRuntimeUrlAuthToken();
    setRuntimeBearerToken(null);
    setRuntimeExtraHeaders(null);
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
};

const selectMatchingB = async (
  config: Awaited<ReturnType<typeof desktopHostsGet>>,
  changes: Partial<Parameters<typeof switchRuntimeEndpoint>[0]> = {},
) => {
  switchRuntimeEndpoint({ apiBaseUrl: savedB, runtimeKey: 'host:b', clientToken: config.hosts[0].clientToken, requestHeaders: config.hosts[0].requestHeaders, sshForwarded: config.hosts[0].sshForwarded === true, ...changes });
  await refreshRuntimeUrlAuthToken(changes.apiBaseUrl ?? savedB).catch(() => {});
};

describe('desktop default restore before application mount', () => {
  test('reload replaces startup A with saved direct B, including credentials and routed requests', async () => {
    await withReloadedDesktop(savedConfig(), async (requests) => {
      await restoreDesktopRuntime();
      expect(getRuntimeApiBaseUrl()).toBe('https://runtime-b.test/chamber');
      expect(getRuntimeKey()).toBe('host:b');
      expect(getRuntimeBearerTokenSync()).toBe('oc_client_fixture_b');
      expect(getRuntimeExtraHeadersSync()).toEqual({ 'X-Fixture-Host': 'b' });
      await runtimeFetch('/api/session/b-session');
      const request = requests.find((entry) => entry.url.endsWith('/api/session/b-session'));
      expect(request?.url).toBe('https://runtime-b.test/chamber/api/session/b-session');
      expect(request?.headers.get('Authorization')).toBe('Bearer oc_client_fixture_b');
      expect(request?.headers.get('X-Fixture-Host')).toBe('b');
    });
  });

  test('restores Local only from the shell-reported local origin and local token', async () => {
    await withReloadedDesktop(savedConfig('local'), async () => {
      await restoreDesktopRuntime();
      expect(getRuntimeApiBaseUrl()).toBe('http://127.0.0.1:3000');
      expect(getRuntimeKey()).toBe('local');
      expect(getRuntimeBearerTokenSync()).toBe('oc_client_fixture_local');
      expect(getRuntimeExtraHeadersSync()).toEqual({});
    });
  });

  test('does not carry immutable A credentials to a direct B with no credentials', async () => {
    const config = savedConfig();
    delete config.hosts[0].clientToken;
    delete config.hosts[0].requestHeaders;
    await withReloadedDesktop(config, async (requests) => {
      await restoreDesktopRuntime();
      expect(getRuntimeApiBaseUrl()).toBe(savedB);
      expect(getRuntimeBearerTokenSync()).toBe('');
      expect(getRuntimeExtraHeadersSync()).toEqual({});
      await runtimeFetch('/api/session/b-session');
      const request = requests.find((entry) => entry.url.endsWith('/api/session/b-session'));
      expect(request?.url).toBe('https://runtime-b.test/chamber/api/session/b-session');
      expect(request?.headers.has('Authorization')).toBe(false);
      expect(request?.headers.has('X-Fixture-Host')).toBe(false);
    });
  });

  test('does not invent a Local backend from the packaged page origin', async () => {
    const config = savedConfig('local');
    config.localOrigin = '';
    await withReloadedDesktop(config, async (_, commands) => {
      await restoreDesktopRuntime();
      expect(getRuntimeApiBaseUrl()).toBe(startupA);
      expect(commands).toEqual(['desktop_hosts_get']);
    });
  });

  test('retains the injected runtime when the default is absent or no longer saved', async () => {
    for (const id of [null, 'removed']) {
      await withReloadedDesktop(savedConfig(id), async () => {
        await restoreDesktopRuntime();
        expect(getRuntimeApiBaseUrl()).toBe(startupA);
        expect(getRuntimeBearerTokenSync()).toBe('oc_client_fixture_a');
      });
    }
  });

  test('keeps the injected runtime when native settings cannot be read', async () => {
    await withReloadedDesktop(savedConfig(), async () => {
      await restoreDesktopRuntime();
      expect(getRuntimeApiBaseUrl()).toBe(startupA);
      expect(getRuntimeBearerTokenSync()).toBe('oc_client_fixture_a');
    }, { failRead: true });
  });

  test('does not read desktop settings on non-Electron surfaces', async () => {
    await withReloadedDesktop(savedConfig(), async (_, commands) => {
      await restoreDesktopRuntime();
      expect(getRuntimeApiBaseUrl()).toBe(startupA);
      expect(commands).toEqual([]);
    }, { electron: false });
  });

  test('retains shell-confirmed SSH forwarding for a saved direct endpoint', async () => {
    const config = savedConfig();
    config.hosts[0].sshForwarded = true;
    await withReloadedDesktop(config, async () => {
      await restoreDesktopRuntime();
      expect(getRuntimeApiBaseUrl()).toBe(savedB);
      expect(isSshForwardedRuntime()).toBe(true);
    });
  });

  test('first load and reload retain Local after the default SSH tunnel fails without probing its forward', async () => {
    const config = savedConfig();
    config.hosts[0].url = 'http://127.0.0.1:43001';
    for (let load = 0; load < 3; load += 1) {
      await withReloadedDesktop(config, async (requests, commands) => {
        requests.length = 0;
        await restoreDesktopRuntime();
        expect(getRuntimeApiBaseUrl()).toBe(localOrigin);
        expect(getRuntimeKey()).toBe('local');
        expect(getRuntimeBearerTokenSync()).toBe('oc_client_fixture_a');
        expect(commands).toEqual(['desktop_hosts_get']);
        expect(requests.some((request) => request.url.includes(':43001'))).toBe(false);
      }, { initialUrl: localOrigin, initialKey: 'local', bootOutcome: { target: 'local', status: 'ok', sshStartupFallbackHostId: 'b' } });
    }
  });

  test('keeps the shell recovery runtime for an unreachable direct default on first load', async () => {
    await withReloadedDesktop(savedConfig(), async (_, commands) => {
      await restoreDesktopRuntime();
      expect(getRuntimeApiBaseUrl()).toBe(startupA);
      expect(commands).toEqual(['desktop_hosts_get']);
    }, { bootOutcome: { target: 'remote', status: 'unreachable', hostId: 'b', url: savedB } });
  });

  test('rechecks a direct default after settings recompute reports remote-ok but its endpoint is still unreachable', async () => {
    await withReloadedDesktop(savedConfig(), async () => {
      await restoreDesktopRuntime();
      expect(getRuntimeApiBaseUrl()).toBe(startupA);
      expect(getRuntimeBearerTokenSync()).toBe('oc_client_fixture_a');
    }, { bootOutcome: { target: 'remote', status: 'ok', hostId: 'b', url: savedB }, probeStatus: 'unreachable' });
  });

  test('does not restore a changed saved default whose probe identifies the wrong service or version', async () => {
    for (const probeStatus of ['wrong-service', 'incompatible'] as const) {
      await withReloadedDesktop(savedConfig(), async () => {
        await restoreDesktopRuntime();
        expect(getRuntimeApiBaseUrl()).toBe(startupA);
      }, { probeStatus });
    }
  });

  test('an already active direct default does not emit changes, reprobe or mint URL tokens', async () => {
    await withReloadedDesktop(savedConfig(), async (requests, commands) => {
      switchRuntimeEndpoint({ apiBaseUrl: savedB, runtimeKey: 'host:b', clientToken: 'oc_client_fixture_b', requestHeaders: { 'X-Fixture-Host': 'b' } });
      await refreshRuntimeUrlAuthToken(savedB);
      requests.length = 0;
      let changes = 0;
      const stop = subscribeRuntimeEndpointChanged(() => { changes += 1; });
      try {
        await restoreDesktopRuntime();
        expect(changes).toBe(0);
        expect(commands).toEqual(['desktop_hosts_get']);
        expect(requests).toEqual([]);
      } finally { stop(); }
    }, { bootOutcome: { target: 'remote', status: 'ok', hostId: 'b', url: savedB } });
  });

  test('matching identity still replaces stale direct credentials and headers', async () => {
    await withReloadedDesktop(savedConfig(), async () => {
      switchRuntimeEndpoint({ apiBaseUrl: savedB, runtimeKey: 'host:b', clientToken: 'oc_client_fixture_stale', requestHeaders: { 'X-Fixture-Host': 'stale' } });
      await restoreDesktopRuntime();
      expect(getRuntimeBearerTokenSync()).toBe('oc_client_fixture_b');
      expect(getRuntimeExtraHeadersSync()).toEqual({ 'X-Fixture-Host': 'b' });
    });
  });

  test('does not replace a runtime selected while the direct probe is pending', async () => {
    await withReloadedDesktop(savedConfig(), async () => {
      await restoreDesktopRuntime();
      expect(getRuntimeKey()).toBe('host:c');
      expect(getRuntimeApiBaseUrl()).toBe('https://runtime-c.test');
      expect(getRuntimeBearerTokenSync()).toBe('oc_client_fixture_c');
    }, { probe: async () => {
      switchRuntimeEndpoint({ apiBaseUrl: 'https://runtime-c.test', runtimeKey: 'host:c', clientToken: 'oc_client_fixture_c' });
      return { status: 'ok', latencyMs: 1 };
    } });
  });

  test('replaces a token-only mismatch when the saved host has no request headers', async () => {
    const config = savedConfig();
    delete config.hosts[0].requestHeaders;
    await withReloadedDesktop(config, async () => {
      await selectMatchingB(config, { clientToken: 'oc_client_fixture_stale' });
      await restoreDesktopRuntime();
      expect(getRuntimeBearerTokenSync()).toBe('oc_client_fixture_b');
      expect(getRuntimeExtraHeadersSync()).toEqual({});
    });
  });

  test('replaces a header-value-only mismatch with an unchanged token and endpoint', async () => {
    const config = savedConfig();
    await withReloadedDesktop(config, async () => {
      await selectMatchingB(config, { requestHeaders: { 'X-Fixture-Host': 'stale' } });
      await restoreDesktopRuntime();
      expect(getRuntimeExtraHeadersSync()).toEqual({ 'X-Fixture-Host': 'b' });
    });
  });

  test('drops an extra active header when all saved header values already match', async () => {
    const config = savedConfig();
    await withReloadedDesktop(config, async () => {
      await selectMatchingB(config, { requestHeaders: { 'X-Fixture-Host': 'b', 'X-Fixture-Stale': 'remove' } });
      await restoreDesktopRuntime();
      expect(getRuntimeExtraHeadersSync()).toEqual({ 'X-Fixture-Host': 'b' });
    });
  });

  test('replaces a URL-only mismatch within the same runtime identity and credentials', async () => {
    const config = savedConfig();
    await withReloadedDesktop(config, async () => {
      await selectMatchingB(config, { apiBaseUrl: 'https://runtime-b.test/old-path' });
      await restoreDesktopRuntime();
      expect(getRuntimeApiBaseUrl()).toBe(savedB);
    });
  });

  test('replaces an SSH-flag-only mismatch with the shell-confirmed forwarding state', async () => {
    const config = savedConfig();
    config.hosts[0].sshForwarded = true;
    await withReloadedDesktop(config, async () => {
      await selectMatchingB(config, { sshForwarded: false });
      await restoreDesktopRuntime();
      expect(isSshForwardedRuntime()).toBe(true);
    });
  });

  test('replaces a key-only mismatch even when URL, credentials and transport match', async () => {
    const config = savedConfig();
    await withReloadedDesktop(config, async () => {
      await selectMatchingB(config, { runtimeKey: 'host:stale-b' });
      await restoreDesktopRuntime();
      expect(getRuntimeKey()).toBe('host:b');
    });
  });

  test('replaces only the active relay transport when all direct runtime fields match', async () => {
    const config = savedConfig();
    await withReloadedDesktop(config, async () => {
      await selectMatchingB(config);
      let closed = false;
      adoptRelayTunnel({ relayUrl: 'wss://relay.fixture.invalid', serverId: 'fixture-b', hostEncPubJwk: {} }, {
        fetch: async () => { throw new Error('unexpected relay fetch'); },
        openWebSocket: () => { throw new Error('unexpected relay socket'); },
        getStatus: () => ({ state: 'idle' }),
        subscribeStatus: () => () => {},
        retry: () => {},
        close: () => { closed = true; },
      });
      try {
        await restoreDesktopRuntime();
        expect(getActiveRelayTunnel()).toBeNull();
        expect(closed).toBe(true);
      } finally { deactivateRelayTunnel(); }
    });
  });
});
