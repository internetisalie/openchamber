import { getRemotes } from '../git/index.js';
import { readConnections } from './storage.js';

export function parseRemote(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  let url;
  if (/^[^/@:]+@[^/:]+:.+/.test(value)) {
    const split = value.indexOf(':');
    try { url = new URL(`ssh://${value.slice(0, split)}/${value.slice(split + 1)}`); }
    catch { return null; }
  } else {
    try { url = new URL(value); } catch { return null; }
  }
  if (!['http:', 'https:', 'ssh:'].includes(url.protocol) || !url.hostname || url.search || url.hash) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const repo = parts.pop().replace(/\.git$/i, '');
  const owner = parts.pop();
  if (!owner || !repo) return null;
  return { protocol: url.protocol, hostname: url.hostname.toLowerCase(), port: url.port,
    prefix: parts.length ? `/${parts.join('/')}` : '', owner, repo };
}

export function matchRemoteToConnection(remote, connections) {
  const matches = connections.filter((connection) => {
    const instance = new URL(connection.instanceUrl);
    const prefix = instance.pathname.replace(/\/$/, '');
    return remote.hostname === instance.hostname.toLowerCase()
      && remote.prefix === prefix
      && (remote.protocol === 'ssh:'
        || (remote.protocol === instance.protocol && remote.port === instance.port));
  });
  return matches.length === 1 ? matches[0] : null;
}

export async function resolveGiteaRepo(directory) {
  const connections = readConnections();
  const remotes = await getRemotes(directory);
  const ordered = remotes.slice().sort((a, b) => Number(b.name === 'origin') - Number(a.name === 'origin'));
  for (const remote of ordered) {
    const parsed = parseRemote(remote.fetchUrl);
    if (!parsed) continue;
    const connection = matchRemoteToConnection(parsed, connections);
    if (connection) return { connection, repo: { owner: parsed.owner, name: parsed.repo }, remote: remote.name };
  }
  return null;
}
