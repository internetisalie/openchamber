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
