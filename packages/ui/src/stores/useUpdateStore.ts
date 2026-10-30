import { create } from 'zustand';
import { z } from 'zod';
import type { UpdateInfo, UpdateProgress } from '@/lib/desktop';
import { checkForDesktopUpdates, isElectronShell, isVSCodeRuntime, isWebRuntime } from '@/lib/desktop';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { isCapacitorApp } from '@/lib/platform';

type ClientRuntime = 'desktop' | 'web' | 'vscode' | 'mobile';
type UpdateState = {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  installing: boolean;
  info: UpdateInfo | null;
  progress: UpdateProgress | null;
  error: string | null;
  runtimeType: ClientRuntime | null;
  lastChecked: number | null;
  nextCheckInSec: number | null;
};
interface UpdateStore extends UpdateState {
  checkForUpdates: () => Promise<number | null>;
  downloadUpdate: () => Promise<void>;
  restartToUpdate: () => Promise<void>;
  dismiss: () => void;
  reset: () => void;
}

const releaseVersion = z.string().regex(/^\d+\.\d+\.\d+-internetisalie\.[1-9]\d*$/);
const updateResponse = z.object({
  available: z.boolean(),
  version: releaseVersion.optional(),
  currentVersion: z.string().optional(),
  body: z.string().optional(),
});
const failureResponse = z.object({ error: z.string() });

export function parseUpdateCheckResponse(payload: unknown): UpdateInfo {
  const data = updateResponse.parse(payload);
  if (data.available && !data.version) throw new Error('The server did not identify a numbered fork release.');
  return {
    ...data,
    currentVersion: data.currentVersion ?? 'unknown',
    releaseUrl: data.version
      ? `https://github.com/internetisalie/openchamber/releases/tag/v${data.version}`
      : 'https://github.com/internetisalie/openchamber/releases',
    installBlocked: 'manual-install',
  };
}

export async function checkConnectedServerForUpdates(): Promise<UpdateInfo> {
  const response = await runtimeFetch('/api/openchamber/update-check?appType=web&reportUsage=false', {
    headers: { Accept: 'application/json' },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const failure = failureResponse.safeParse(payload);
    throw new Error(failure.success ? failure.data.error : `Server responded with ${response.status}`);
  }
  return parseUpdateCheckResponse(payload);
}

function detectRuntimeType(): ClientRuntime | null {
  if (isCapacitorApp()) return 'mobile';
  if (isElectronShell()) return 'desktop';
  if (isVSCodeRuntime()) return 'vscode';
  if (isWebRuntime()) return 'web';
  return null;
}

const initialState: UpdateState = {
  checking: false, available: false, downloading: false, downloaded: false, installing: false,
  info: null, progress: null, error: null, runtimeType: null, lastChecked: null, nextCheckInSec: null,
};

export const useUpdateStore = create<UpdateStore>()((set) => ({
  ...initialState,
  checkForUpdates: async () => {
    const runtime = detectRuntimeType();
    if (!runtime) return null;
    set({ checking: true, error: null, runtimeType: runtime });
    try {
      // Native mobile checks the connected server. VS Code routes the same
      // request through its extension-host bridge. All results are manual-only.
      const info = runtime === 'desktop'
        ? parseUpdateCheckResponse(await checkForDesktopUpdates())
        : await checkConnectedServerForUpdates();
      set({ checking: false, available: info?.available ?? false, info, lastChecked: Date.now() });
    } catch (error) {
      // Preserve the previous release on network failure. The error prevents
      // About from presenting a failed request as an up-to-date result.
      set({ checking: false, error: error instanceof Error ? error.message : 'Failed to check fork releases.' });
    }
    return null;
  },
  // These legacy store actions remain fail-closed for callers with stale state.
  downloadUpdate: async () => { throw new Error('In-place fork updates are disabled.'); },
  restartToUpdate: async () => { throw new Error('In-place fork updates are disabled.'); },
  dismiss: () => set({ available: false, downloaded: false, installing: false, info: null, progress: null }),
  reset: () => set(initialState),
}));
