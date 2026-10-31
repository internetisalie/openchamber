import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { opencodeClient, type ProjectFileSearchHit } from '@/lib/opencode/client';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { assertFileSourceIdentity, changedFileSource, invalidFileResponse, requireFileSourceIdentity } from '@/lib/api/file-source';
import type { WorkspaceFileSource } from '@/lib/api/types';

const CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 40;
const DEFAULT_SEARCH_LIMIT = 60;

interface FileSearchCacheEntry {
  files: ProjectFileSearchHit[];
  timestamp: number;
}

interface FileSearchStoreState {
  cache: Record<string, FileSearchCacheEntry>;
  cacheKeys: string[];
  inFlight: Record<string, Promise<ProjectFileSearchHit[]>>;
  searchFiles: (
    directory: string,
    query: string,
    limit?: number,
    options?: { includeHidden?: boolean; respectGitignore?: boolean; type?: 'file' | 'directory' }
  ) => Promise<ProjectFileSearchHit[]>;
  invalidateDirectory: (directory?: string | null) => void;
  resetForRuntimeSwitch: () => void;
}

const buildCacheKey = (
  runtimeKey: string,
  directory: string,
  query: string,
  limit: number,
  includeHidden: boolean,
  respectGitignore: boolean,
  type: 'file' | 'directory'
) => {
  const normalizedDirectory = directory.trim();
  const normalizedQuery = query.trim().toLowerCase();
  return JSON.stringify([runtimeKey, normalizedDirectory, normalizedQuery, limit, includeHidden, respectGitignore, type]);
};

const cacheKeyMatchesDirectory = (cacheKey: string, directory: string) => {
  try {
    const value: unknown = JSON.parse(cacheKey);
    return Array.isArray(value) && value[1] === directory;
  } catch {
    return false;
  }
};

export const useFileSearchStore = create<FileSearchStoreState>()(
  devtools(
    (set, get) => ({
      cache: {},
      cacheKeys: [],
      inFlight: {},
      async searchFiles(directory, query, limit = DEFAULT_SEARCH_LIMIT, options) {
        if (!directory || directory.trim().length === 0) {
          return [];
        }

        const normalizedDirectory = directory.trim();
        const runtimeKey = getRuntimeKey();
        const normalizedQuery = typeof query === 'string' ? query.trim() : '';
        const includeHidden = Boolean(options?.includeHidden);
        const respectGitignore = options?.respectGitignore ?? true;
        const type = options?.type === 'directory' ? 'directory' : 'file';
        const key = buildCacheKey(runtimeKey, normalizedDirectory, normalizedQuery, limit, includeHidden, respectGitignore, type);
        const now = Date.now();
        const cached = get().cache[key];
        const runtimeFiles = getRegisteredRuntimeAPIs()?.files;

        if (!runtimeFiles?.resolveWorkspaceFileSource && cached && now - cached.timestamp < CACHE_TTL_MS) {
          return cached.files;
        }

        const inflight = get().inFlight[key];
        if (inflight) {
          return inflight;
        }

        let remote = false;
        let usedLocalCache = false;
        let supplementalFailed = false;
        const localSearch = () => {
        const indexedSearch = opencodeClient.searchFiles(normalizedQuery, {
          directory: normalizedDirectory,
          limit,
          type,
        });
        const supplementalSearch = type === 'file' && (includeHidden || !respectGitignore) && runtimeFiles
          ? runtimeFiles.search({
              directory: normalizedDirectory,
              query: normalizedQuery,
              maxResults: limit,
              includeHidden,
              respectGitignore,
            }).then((results) =>
              results.map((result) => {
                const normalizedPath = result.path.replace(/\\/g, '/');
                const previewPath = result.preview?.[0]
                  ? result.preview[0].replace(/\\/g, '/')
                  : normalizedPath;
                const name = previewPath.split('/').filter(Boolean).pop() || normalizedPath.split('/').filter(Boolean).pop() || '';
                return {
                  name,
                  path: normalizedPath,
                  relativePath: previewPath,
                  extension: name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined,
                };
              })
            ).catch((error: unknown) => {
              supplementalFailed = true;
              console.warn('Supplemental file search failed; keeping indexed results:', error);
              return [];
            })
          : Promise.resolve([]);

        return Promise.all([indexedSearch, supplementalSearch])
          .then(([indexed, supplemental]) => {
            if (supplemental.length === 0) return indexed;
            const seen = new Set(indexed.map((file) => file.path.replace(/\\/g, '/')));
            return [...indexed, ...supplemental.filter((file) => {
              if (seen.has(file.path)) return false;
              seen.add(file.path);
              return true;
            })].slice(0, limit);
          });
        };
        const remoteSearch = async (source: Extract<WorkspaceFileSource, { kind: 'remote' }>): Promise<ProjectFileSearchHit[]> => {
          remote = true;
          requireFileSourceIdentity(source.sourceIdentity);
          if (!runtimeFiles?.searchWithSource || !runtimeFiles.resolveWorkspaceFileSource) throw invalidFileResponse();
          const result = await runtimeFiles.searchWithSource({ directory: normalizedDirectory, query: normalizedQuery,
            maxResults: limit, includeHidden, respectGitignore, type });
          if (getRuntimeKey() !== runtimeKey || get().inFlight[key] !== searchPromise) throw changedFileSource();
          assertFileSourceIdentity(result.sourceIdentity, source.sourceIdentity);
          if (!Array.isArray(result.files) || result.files.length > Math.min(100, limit)) throw invalidFileResponse();
          const current = await runtimeFiles.resolveWorkspaceFileSource(normalizedDirectory);
          if (current.kind !== 'remote') throw changedFileSource();
          assertFileSourceIdentity(current.sourceIdentity, source.sourceIdentity);
          if (getRuntimeKey() !== runtimeKey || get().inFlight[key] !== searchPromise) throw changedFileSource();
          return result.files.map((result) => {
            if (!result || typeof result.path !== 'string') throw invalidFileResponse();
            const path = result.path.replace(/\\/g, '/');
            const relativePath = result.preview?.[0];
            if (typeof relativePath !== 'string' || !relativePath
              || relativePath.startsWith('/') || relativePath.includes('\\') || relativePath.includes('\0')
              || relativePath.split('/').some((part) => !part || part === '.' || part === '..')
              || path !== `${normalizedDirectory.replace(/\/$/, '')}/${relativePath}`) throw invalidFileResponse();
            const name = relativePath.split('/').pop()!;
            return { path, relativePath, name, extension: name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined };
          });
        };
        const resolve = runtimeFiles?.resolveWorkspaceFileSource;
        const task = resolve ? resolve(normalizedDirectory).then((source) => {
          if (getRuntimeKey() !== runtimeKey) throw changedFileSource();
          if (source.kind === 'remote') {
            if (get().inFlight[key] !== searchPromise) throw changedFileSource();
            return remoteSearch(source);
          }
          if (source.kind !== 'local') throw invalidFileResponse();
          if (cached && now - cached.timestamp < CACHE_TTL_MS) {
            usedLocalCache = true;
            return cached.files;
          }
          return localSearch();
        }) : localSearch();
        const searchPromise: Promise<ProjectFileSearchHit[]> = task
          .then((files) => {
            if (remote) {
              if (get().inFlight[key] === searchPromise && get().cache[key]) set((state) => {
                const cache = { ...state.cache };
                delete cache[key];
                return { cache, cacheKeys: state.cacheKeys.filter((item) => item !== key) };
              });
              return files;
            }
            if (supplementalFailed || usedLocalCache) return files;
            set((state) => {
              if (state.inFlight[key] !== searchPromise) {
                return state;
              }

              const nextCache = { ...state.cache, [key]: { files, timestamp: Date.now() } };
              const nextKeys = state.cacheKeys.filter((cacheKey) => cacheKey !== key);
              nextKeys.push(key);

              while (nextKeys.length > MAX_CACHE_ENTRIES) {
                const oldestKey = nextKeys.shift();
                if (oldestKey) {
                  delete nextCache[oldestKey];
                }
              }

              return {
                cache: nextCache,
                cacheKeys: nextKeys,
              };
            });
            return files;
          })
          .catch((error: unknown) => {
            if (resolve && get().inFlight[key] === searchPromise) {
              set((state) => {
                const cache = { ...state.cache };
                delete cache[key];
                return { cache, cacheKeys: state.cacheKeys.filter((item) => item !== key) };
              });
            }
            throw error;
          })
          .finally(() => {
            set((state) => {
              if (state.inFlight[key] !== searchPromise) {
                return state;
              }

              const nextInFlight = { ...state.inFlight };
              delete nextInFlight[key];
              return { inFlight: nextInFlight };
            });
          });

        set((state) => ({
          inFlight: {
            ...state.inFlight,
            [key]: searchPromise,
          },
        }));

        return searchPromise;
      },
      invalidateDirectory(directory) {
        if (!directory || directory.trim().length === 0) {
          set({ cache: {}, cacheKeys: [], inFlight: {} });
          return;
        }

        const normalizedDirectory = directory.trim();

        set((state) => {
          const nextCache = { ...state.cache };
          const nextKeys = state.cacheKeys.filter((cacheKey) => {
            if (cacheKeyMatchesDirectory(cacheKey, normalizedDirectory)) {
              delete nextCache[cacheKey];
              return false;
            }
            return true;
          });

          const nextInFlightEntries = Object.entries(state.inFlight).filter(
            ([key]) => !cacheKeyMatchesDirectory(key, normalizedDirectory)
          );
          const nextInFlight = Object.fromEntries(nextInFlightEntries);

          return {
            cache: nextCache,
            cacheKeys: nextKeys,
            inFlight: nextInFlight,
          };
        });
      },
      resetForRuntimeSwitch() {
        set({ cache: {}, cacheKeys: [], inFlight: {} });
      },
    }),
    {
      name: 'file-search-store',
    }
  )
);
