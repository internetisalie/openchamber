import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeInstanceUrl } from './instance.js';

function filePath() {
  const dataDir = process.env.OPENCHAMBER_DATA_DIR
    ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
    : path.join(os.homedir(), '.config', 'openchamber');
  return path.join(dataDir, 'gitea-auth.json');
}

export function readConnections() {
  const file = filePath();
  if (!fs.existsSync(file)) return [];
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error('Could not read Gitea connections');
  }
  if (!Array.isArray(data?.connections)) throw new Error('Invalid Gitea connections file');
  const connections = data.connections.map((entry) => {
    if (typeof entry?.instanceUrl !== 'string' || typeof entry?.token !== 'string'
      || typeof entry?.user?.login !== 'string' || !entry.token) {
      throw new Error('Invalid Gitea connection');
    }
    return { instanceUrl: normalizeInstanceUrl(entry.instanceUrl), token: entry.token, user: { login: entry.user.login } };
  });
  if (new Set(connections.map((entry) => entry.instanceUrl)).size !== connections.length) {
    throw new Error('Duplicate Gitea connections');
  }
  return connections;
}

function writeConnections(connections) {
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify({ connections }), { mode: 0o600 });
    fs.renameSync(temporary, file);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch { /* no temporary file */ }
    throw error;
  }
}

export function saveConnection(connection) {
  const connections = readConnections().filter((entry) => entry.instanceUrl !== connection.instanceUrl);
  connections.push(connection);
  writeConnections(connections);
}

export function removeConnection(instanceUrl) {
  const connections = readConnections();
  const remaining = connections.filter((entry) => entry.instanceUrl !== instanceUrl);
  if (remaining.length === connections.length) return false;
  writeConnections(remaining);
  return true;
}

export function publicConnections() {
  return readConnections().map(({ instanceUrl, user }) => ({ instanceUrl, user }));
}
