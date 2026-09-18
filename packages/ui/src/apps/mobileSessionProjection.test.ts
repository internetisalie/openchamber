import { expect, test } from 'bun:test';
import type { Session } from '@opencode-ai/sdk/v2';

import { deriveRecentSessions } from '@/components/session/sidebar/recent/activitySections';
import { ensureChatsRootDirectory } from '@/lib/chatDirectories';
import { opencodeClient } from '@/lib/opencode/client';

import { partitionMobileSessions, resolveMobileSessionTarget } from './mobileSessionProjection';

const session = (id: string, directory: string, projectID = 'project'): Session => ({
  id,
  slug: id,
  projectID,
  directory,
  title: id,
  version: '1',
  time: { created: 1, updated: 1 },
});

const originalHomeInfo = opencodeClient.getFilesystemHomeInfo;
opencodeClient.getFilesystemHomeInfo = async () => ({ home: '/home' });
try {
  await ensureChatsRootDirectory();
} finally {
  opencodeClient.getFilesystemHomeInfo = originalHomeInfo;
}

const withMobileRuntime = (runtime: 'hosted' | 'capacitor', run: () => void): void => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { protocol: runtime === 'capacitor' ? 'capacitor:' : 'https:' },
      Capacitor: { isNativePlatform: () => runtime === 'capacitor' },
    },
  });
  try {
    run();
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
};

test('hosted mobile gives Global sessions a dedicated partition without project or Recent duplication', () => {
  const managedChat = session(
    'session-managed',
    '/home/.config/openchamber/chats/2026-09-14/session-managed',
    'global',
  );
  const matchingGlobal = session('session-global-matching', '/workspace/project', 'global');
  const unownedGlobal = session('session-global-unowned', '/outside/projects', 'global');
  const project = session('session-project', '/workspace/project');
  withMobileRuntime('hosted', () => {
    const projection = partitionMobileSessions([managedChat, matchingGlobal, unownedGlobal, project]);

    expect(projection.chatSessions.map((entry) => entry.id)).toEqual(['session-managed']);
    expect(projection.globalSessions.map((entry) => entry.id)).toEqual([
      'session-global-matching',
      'session-global-unowned',
    ]);
    expect(projection.projectSessions.map((entry) => entry.id)).toEqual(['session-project']);
    expect(deriveRecentSessions(
      projection.projectSessions,
      new Set(['session-global-matching', 'session-global-unowned']),
      200_000_000,
    )).toEqual([]);

    const visibleIds = [
      ...projection.chatSessions,
      ...projection.globalSessions,
      ...projection.projectSessions,
    ].map((entry) => entry.id);
    expect(new Set(visibleIds).size).toBe(visibleIds.length);
  });
});

test('Capacitor keeps Global sessions as project candidates and has no dedicated Global partition', () => {
  const matchingGlobal = session('session-global-matching', '/workspace/project', 'global');
  const unownedGlobal = session('session-global-unowned', '/outside/projects', 'global');
  withMobileRuntime('capacitor', () => {
    const projection = partitionMobileSessions([matchingGlobal, unownedGlobal]);

    expect(projection.globalSessions).toEqual([]);
    expect(projection.projectSessions.map((entry) => entry.id)).toEqual([
      'session-global-matching',
      'session-global-unowned',
    ]);
  });
});

test('mobile selection targets the session returned directory', () => {
  const globalSession = session('session-global', '/returned/global-directory/', 'global');

  expect(resolveMobileSessionTarget(globalSession)).toEqual({
    sessionId: 'session-global',
    directory: '/returned/global-directory',
  });
});
