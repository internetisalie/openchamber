import { afterEach, describe, expect, test } from 'bun:test';
import type { DesktopHost } from './desktopHosts';
import { getLocalDesktopOrigin, resolveCurrentDesktopHost, withLocalDesktopHost } from './desktopCurrentHost';

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

const setWindow = (href: string, localOrigin?: string, apiBaseUrl?: string) => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { href, origin: href.startsWith('openchamber-ui:') ? 'openchamber-ui://app' : new URL(href).origin },
      __OPENCHAMBER_LOCAL_ORIGIN__: localOrigin,
      __OPENCHAMBER_API_BASE_URL__: apiBaseUrl,
    },
  });
};

type PageWindow = {
  location: { origin: string; href: string };
  __OPENCHAMBER_LOCAL_ORIGIN__?: string;
  __OPENCHAMBER_API_BASE_URL__?: string;
};

const showPage = (page: { origin: string; injectedLocalOrigin?: string; injectedApiBaseUrl?: string }): void => {
  const value: PageWindow = { location: { origin: page.origin, href: `${page.origin}/` } };
  if (page.injectedLocalOrigin !== undefined) value.__OPENCHAMBER_LOCAL_ORIGIN__ = page.injectedLocalOrigin;
  if (page.injectedApiBaseUrl !== undefined) value.__OPENCHAMBER_API_BASE_URL__ = page.injectedApiBaseUrl;
  Object.defineProperty(globalThis, 'window', { configurable: true, value });
};

afterEach(() => {
  if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

describe('desktop local backend discovery', () => {
  for (const [activeUrl, savedUrl] of [
    ['http://127.0.0.1:3037/', 'http://localhost:3037/'],
    ['http://localhost:3037/', 'http://127.0.0.1:3037/'],
  ]) {
    test(`resolves the saved name on startup across loopback aliases: ${activeUrl}`, () => {
      setWindow('openchamber-ui://app/index.html', '', activeUrl);
      expect(resolveCurrentDesktopHost([{ id: 'mini-dev', label: 'mini-dev', url: savedUrl }]))
        .toEqual({ id: 'mini-dev', label: 'mini-dev', url: savedUrl });
    });
  }

  test('prefers an exact saved endpoint over a loopback alias', () => {
    setWindow('openchamber-ui://app/index.html', '', 'http://127.0.0.1:3037/');
    expect(resolveCurrentDesktopHost([
      { id: 'alias', label: 'Alias', url: 'http://localhost:3037/' },
      { id: 'exact', label: 'Exact', url: 'http://127.0.0.1:3037/' },
    ]).id).toBe('exact');
  });

  for (const savedUrl of [
    'http://localhost:3038/',
    'https://localhost:3037/',
    'http://localhost:3037/another-backend',
    'http://localhost:3037/?backend=other',
    'http://remote.example:3037/',
    'http://localhost.example:3037/',
    'http://127.0.0.2:3037/',
  ]) {
    test(`does not coalesce a different backend: ${savedUrl}`, () => {
      setWindow('openchamber-ui://app/index.html', '', 'http://127.0.0.1:3037/');
      expect(resolveCurrentDesktopHost([{ id: 'other', label: 'Other', url: savedUrl }]).id).toBe('custom');
    });
  }

  test('bundled UI without a local server does not become a backend', () => {
    setWindow('openchamber-ui://app/index.html', '', 'http://localhost:3037');
    expect(getLocalDesktopOrigin()).toBe('');
    expect(withLocalDesktopHost([], getLocalDesktopOrigin())).toEqual([]);
    expect(resolveCurrentDesktopHost([])).toMatchObject({ id: 'custom', url: 'http://localhost:3037' });
  });

  test('an enabled local backend remains discoverable before a connection succeeds', () => {
    setWindow('openchamber-ui://app/index.html', 'http://127.0.0.1:57123', 'http://127.0.0.1:57123');
    const hosts = withLocalDesktopHost([], getLocalDesktopOrigin());
    expect(hosts[0].url).toBe('http://127.0.0.1:57123');
    expect(resolveCurrentDesktopHost(hosts).id).toBe('local');
  });

  test('a loopback page alone does not declare a local server', () => {
    setWindow('http://127.0.0.1:57123/');
    expect(getLocalDesktopOrigin()).toBe('');
  });

  test('an explicit absent backend overrides an HTTP document origin', () => {
    setWindow('https://remote.example/', '', 'https://remote.example');
    expect(getLocalDesktopOrigin()).toBe('');
  });
});

const remote: DesktopHost = { id: 'remote', label: 'Remote', url: 'http://192.168.1.20:3000' };

describe('Local in the desktop instance list', () => {
  // #4410 and #4632: Local used to take the page's own origin, which named the
  // packaged UI scheme, or the instance whose page the window was showing.
  test('is left out when the shell reported no local origin', () => {
    for (const page of [
      // OPENCHAMBER_SKIP_LOCAL_SERVER=1: the shell injects an empty origin.
      { origin: 'openchamber-ui://app', injectedLocalOrigin: '' },
      // A page another instance served, before the shell's init script ran.
      { origin: 'http://192.168.1.20:3000' },
    ]) {
      setWindow(`${page.origin}/`, page.injectedLocalOrigin);
      expect(withLocalDesktopHost([remote], getLocalDesktopOrigin())).toEqual([remote]);
    }
    // The hosts config answers null for a shell without a local server.
    expect(withLocalDesktopHost([remote], null)).toEqual([remote]);
  });

  test('comes first with the origin the shell reported', () => {
    setWindow('http://192.168.1.20:3000/', 'http://127.0.0.1:57123');
    expect(withLocalDesktopHost([remote], getLocalDesktopOrigin())).toEqual([
      { id: 'local', label: 'Local', url: 'http://127.0.0.1:57123' },
      remote,
    ]);
  });
});

describe('The instance the desktop window is on', () => {
  // #5241: OPENCHAMBER_SKIP_LOCAL_SERVER=1 with OPENCHAMBER_SERVER_URL pointing
  // at an unsaved server. The packaged page was named Local, an entry the list
  // left out, so the switcher offered no way to the instance it claimed.
  test('names an unsaved address on the packaged page by that address', () => {
    showPage({ origin: 'openchamber-ui://app', injectedLocalOrigin: '', injectedApiBaseUrl: 'http://127.0.0.1:3000/' });
    expect(resolveCurrentDesktopHost(withLocalDesktopHost([remote], null))).toEqual({
      id: 'custom',
      label: 'http://127.0.0.1:3000/',
      url: 'http://127.0.0.1:3000/',
    });
  });

  test('names that address too while the local server runs', () => {
    showPage({ origin: 'openchamber-ui://app', injectedLocalOrigin: 'http://127.0.0.1:57123', injectedApiBaseUrl: 'http://127.0.0.1:3000' });
    expect(resolveCurrentDesktopHost(withLocalDesktopHost([remote], 'http://127.0.0.1:57123')).label).toBe('http://127.0.0.1:3000/');
  });

  test('is Local on the packaged page talking to the local server', () => {
    showPage({ origin: 'openchamber-ui://app', injectedLocalOrigin: 'http://127.0.0.1:57123', injectedApiBaseUrl: 'http://127.0.0.1:57123' });
    expect(resolveCurrentDesktopHost(withLocalDesktopHost([remote], 'http://127.0.0.1:57123')).id).toBe('local');
  });

  test('is a saved instance when the runtime is that instance', () => {
    showPage({ origin: 'openchamber-ui://app', injectedLocalOrigin: '', injectedApiBaseUrl: 'http://192.168.1.20:3000' });
    expect(resolveCurrentDesktopHost(withLocalDesktopHost([remote], null)).id).toBe('remote');
  });
});
