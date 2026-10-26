import { describe, expect, test } from 'bun:test';
import { restoreDesktopRuntime } from './desktopRelayRestore';
import { desktopHostsGet } from './desktopHosts';
import { resolveGuestFrameUrl } from './guests/frame-url';
import { clearRuntimeUrlAuthToken, getRuntimeBearerTokenSync, getRuntimeExtraHeadersSync, setRuntimeBearerToken, setRuntimeExtraHeaders } from './runtime-auth';
import { runtimeFetch } from './runtime-fetch';
import { getRuntimeApiBaseUrl, getRuntimeKey, isSshForwardedRuntime, switchRuntimeEndpoint } from './runtime-switch';

const startupA = 'https://runtime-a.test';
const savedB = 'https://runtime-b.test/chamber';
const savedConfig = (defaultHostId: string | null = 'b'): Awaited<ReturnType<typeof desktopHostsGet>> => ({
  hosts: [{ id: 'b', label: 'B', url: savedB, clientToken: 'oc_client_fixture_b', requestHeaders: { 'X-Fixture-Host': 'b' } }],
  defaultHostId,
  initialHostChoiceCompleted: true,
  localOrigin: 'http://127.0.0.1:3000',
});

const withReloadedDesktop = async (
  config: Awaited<ReturnType<typeof desktopHostsGet>>,
  run: (requests: Request[], commands: string[]) => Promise<void>,
  options: { electron?: boolean; failRead?: boolean } = {},
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
    __OPENCHAMBER_DESKTOP__: {
      invoke: async (command: string) => {
        commands.push(command);
        if (command === 'desktop_hosts_get') {
          if (options.failRead) throw new Error('config unavailable');
          return config;
        }
        if (command === 'desktop_local_client_token_get') return 'oc_client_fixture_local';
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
      if (request.url.startsWith('https://runtime-b.test/chamber/auth/url-token')) {
        return Response.json({ token: 'fixture_guest_url_token_b', expiresAt: Date.now() + 60_000 });
      }
      return new Response(null, { status: 404 });
    }, { preconnect: async () => {} });
    switchRuntimeEndpoint({ apiBaseUrl: startupA, runtimeKey: 'host:a', clientToken: 'oc_client_fixture_a', requestHeaders: { 'X-Fixture-Host': 'a' } });
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

  test('authorizes a guest frame on restored B instead of the immutable A injection', async () => {
    await withReloadedDesktop(savedConfig(), async (requests) => {
      await restoreDesktopRuntime();
      const frame = await resolveGuestFrameUrl('openchamber-agent-memory', 'dist/index.html');
      expect(frame.kind).toBe('url');
      if (frame.kind !== 'url') throw new Error('expected a direct guest URL');
      const url = new URL(frame.url);
      expect(url.origin).toBe('https://runtime-b.test');
      expect(url.pathname).toBe('/chamber/api/guests/openchamber-agent-memory/dist/index.html');
      expect(url.searchParams.get('oc_url_token')).toBe('fixture_guest_url_token_b');
      const mint = requests.find((request) => new URL(request.url).searchParams.get('scope') === 'guest:openchamber-agent-memory');
      expect(mint?.url).toBe('https://runtime-b.test/chamber/auth/url-token?scope=guest%3Aopenchamber-agent-memory');
      expect(mint?.headers.get('Authorization')).toBe('Bearer oc_client_fixture_b');
      expect(mint?.headers.get('X-Fixture-Host')).toBe('b');
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
});
