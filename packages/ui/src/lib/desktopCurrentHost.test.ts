import { afterEach, describe, expect, test } from 'bun:test';
import { buildLocalDesktopHost, getLocalDesktopOrigin, resolveCurrentDesktopHost } from './desktopCurrentHost';

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

afterEach(() => {
  if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

describe('desktop local backend discovery', () => {
  test.each([
    ['http://127.0.0.1:3037/', 'http://localhost:3037/'],
    ['http://localhost:3037/', 'http://127.0.0.1:3037/'],
  ])('resolves the saved name on startup across loopback aliases: %s', (activeUrl, savedUrl) => {
    setWindow('openchamber-ui://app/index.html', '', activeUrl);
    expect(resolveCurrentDesktopHost([{ id: 'mini-dev', label: 'mini-dev', url: savedUrl }]))
      .toEqual({ id: 'mini-dev', label: 'mini-dev', url: savedUrl });
  });

  test('prefers an exact saved endpoint over a loopback alias', () => {
    setWindow('openchamber-ui://app/index.html', '', 'http://127.0.0.1:3037/');
    expect(resolveCurrentDesktopHost([
      { id: 'alias', label: 'Alias', url: 'http://localhost:3037/' },
      { id: 'exact', label: 'Exact', url: 'http://127.0.0.1:3037/' },
    ]).id).toBe('exact');
  });

  test.each([
    'http://localhost:3038/',
    'https://localhost:3037/',
    'http://localhost:3037/another-backend',
    'http://localhost:3037/?backend=other',
    'http://remote.example:3037/',
    'http://localhost.example:3037/',
    'http://127.0.0.2:3037/',
  ])('does not coalesce a different backend: %s', (savedUrl) => {
    setWindow('openchamber-ui://app/index.html', '', 'http://127.0.0.1:3037/');
    expect(resolveCurrentDesktopHost([{ id: 'other', label: 'Other', url: savedUrl }]).id).toBe('custom');
  });

  test('bundled UI without a local server does not become a backend', () => {
    setWindow('openchamber-ui://app/index.html', '', 'http://localhost:3037');
    expect(getLocalDesktopOrigin()).toBe('');
    expect(buildLocalDesktopHost().url).toBe('');
    expect(resolveCurrentDesktopHost([])).toMatchObject({ id: 'custom', url: 'http://localhost:3037' });
  });

  test('an enabled local backend remains discoverable before a connection succeeds', () => {
    setWindow('openchamber-ui://app/index.html', 'http://127.0.0.1:57123', 'http://127.0.0.1:57123');
    expect(buildLocalDesktopHost().url).toBe('http://127.0.0.1:57123');
    expect(resolveCurrentDesktopHost([buildLocalDesktopHost()]).id).toBe('local');
  });

  test('legacy loopback UI still discovers its HTTP backend', () => {
    setWindow('http://127.0.0.1:57123/');
    expect(getLocalDesktopOrigin()).toBe('http://127.0.0.1:57123');
  });

  test('an explicit absent backend overrides an HTTP document origin', () => {
    setWindow('https://remote.example/', '', 'https://remote.example');
    expect(getLocalDesktopOrigin()).toBe('');
  });
});
