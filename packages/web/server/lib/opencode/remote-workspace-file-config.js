import {
  canonicalRemoteRoot,
  createRemoteWorkspaceFiles,
  remoteFilesUnavailable,
  RemoteWorkspaceFileError,
  remoteWorkspaceDirectorySelectors,
} from './remote-workspace-files.js';

const configuredRoots = (raw) => {
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries) || entries.length === 0) throw remoteFilesUnavailable();
  const roots = new Map();
  const workspaceIDs = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).length !== 2 || !Object.hasOwn(entry, 'workspaceID') || !Object.hasOwn(entry, 'directory')
      || typeof entry.workspaceID !== 'string' || !entry.workspaceID.trim()) throw remoteFilesUnavailable();
    const directory = canonicalRemoteRoot(entry.directory);
    if (roots.has(directory) || workspaceIDs.has(entry.workspaceID)) throw remoteFilesUnavailable();
    workspaceIDs.add(entry.workspaceID);
    roots.set(directory, Object.freeze({ mode: 'remote', workspaceID: entry.workspaceID, directory }));
  }
  return roots;
};

export const createConfiguredRemoteWorkspaceFiles = ({ configuredWorkspaces, buildOpenCodeUrl, getOpenCodeAuthHeaders, fetchImpl }) => {
  if (configuredWorkspaces === undefined) return undefined;
  let roots;
  try {
    if (typeof configuredWorkspaces !== 'string') throw remoteFilesUnavailable();
    roots = configuredRoots(configuredWorkspaces);
  } catch {
    roots = null;
  }
  return createRemoteWorkspaceFiles({
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders,
    fetchImpl,
    resolve: (req) => {
      if (roots === null) throw remoteFilesUnavailable();
      const [directory] = remoteWorkspaceDirectorySelectors(req);
      const scope = roots.get(directory);
      if (!scope) throw new RemoteWorkspaceFileError(400, 'invalid-path', 'Remote workspace selector is not configured');
      return scope;
    },
  });
};
