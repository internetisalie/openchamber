import {
  canonicalRemoteRoot,
  createRemoteWorkspaceFiles,
  remoteFilesUnavailable,
  RemoteWorkspaceFileError,
  remoteWorkspaceDirectorySelectors,
} from './remote-workspace-files.js';
import { z } from 'zod';

const configuredWorkspaceSchema = z.object({
  workspaceID: z.string().refine((value) => value.trim().length > 0),
  directory: z.string(),
}).strict();
const configuredWorkspacesSchema = z.array(configuredWorkspaceSchema).min(1);

const configuredRoots = (raw) => {
  const input = z.string().safeParse(raw);
  if (!input.success) throw remoteFilesUnavailable();
  const parsed = configuredWorkspacesSchema.safeParse(JSON.parse(input.data));
  if (!parsed.success) throw remoteFilesUnavailable();
  const roots = new Map();
  const workspaceIDs = new Set();
  for (const entry of parsed.data) {
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
