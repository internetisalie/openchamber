import express from 'express';
import { GiteaRequestError, requestGitea, requestGiteaPage, verifyConnection } from './client.js';
import { normalizeInstanceUrl } from './instance.js';
import { resolveGiteaRepo } from './repo.js';
import { publicConnections, removeConnection, saveConnection } from './storage.js';

const parseBody = express.json({ limit: '16kb' });
const PAGE_SIZE = 30;
const COMMENT_PAGE_SIZE = 50;
const MAX_COMMENTS = 100;
const MAX_COMMENT_PAGES = 10;

function fail(res, error) {
  if (error instanceof GiteaRequestError) {
    const status = [401, 403, 404].includes(error.status) ? error.status : 502;
    return res.status(status).json({ error: error.message });
  }
  return res.status(502).json({ error: error instanceof Error ? error.message : 'Gitea request failed' });
}

function directoryFromRequest(req) {
  return typeof req.query.directory === 'string' ? req.query.directory.trim() : '';
}

async function repositoryForRequest(req, res, resolveRepository) {
  const directory = directoryFromRequest(req);
  if (!directory) {
    res.status(400).json({ error: 'directory is required' });
    return null;
  }
  const resolved = await resolveRepository(directory);
  if (!resolved) {
    res.status(404).json({ error: 'No connected Gitea instance matches a Git remote in this directory' });
    return null;
  }
  return resolved;
}

function publicRepo({ connection, repo, remote }) {
  return { instanceUrl: connection.instanceUrl, owner: repo.owner, name: repo.name, remote };
}

function itemFromApi(raw, kind, repo) {
  const number = raw?.number ?? raw?.index;
  if (!Number.isInteger(number) || number < 1 || typeof raw?.title !== 'string') {
    throw new Error('Gitea returned an invalid issue or pull request');
  }
  const url = `${repo.instanceUrl}/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/${kind === 'pr' ? 'pulls' : 'issues'}/${number}`;
  return {
    kind, number, title: raw.title, body: typeof raw.body === 'string' ? raw.body : '',
    url, state: raw.state === 'closed' ? 'closed' : 'open',
    author: typeof raw.user?.login === 'string' ? raw.user.login : null,
  };
}

function commentsFromApi(raw) {
  if (!Array.isArray(raw)) throw new Error('Gitea returned invalid comments');
  return raw.map((entry) => ({
    author: typeof entry?.user?.login === 'string' ? entry.user.login : null,
    body: typeof entry?.body === 'string' ? entry.body : '',
  }));
}

export function registerGiteaRoutes(app, { resolveRepository = resolveGiteaRepo } = {}) {
  app.get('/api/gitea/connections', (_req, res) => {
    try { res.json({ connections: publicConnections() }); } catch (error) { fail(res, error); }
  });

  app.post('/api/gitea/connections', parseBody, async (req, res) => {
    const { instanceUrl, token, allowHttp } = req.body ?? {};
    if (typeof token !== 'string' || !token.trim() || token.length > 2048) {
      return res.status(400).json({ error: 'A personal access token is required' });
    }
    let normalized;
    try { normalized = normalizeInstanceUrl(instanceUrl); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    if (normalized.startsWith('http://') && allowHttp !== true) {
      return res.status(400).json({ error: 'Confirm the use of HTTP for this instance' });
    }
    try {
      const connection = await verifyConnection(normalized, token.trim());
      saveConnection(connection);
      return res.json({ instanceUrl: normalized, user: connection.user });
    } catch (error) {
      return fail(res, error);
    }
  });

  app.delete('/api/gitea/connections', async (req, res) => {
    let instanceUrl;
    try { instanceUrl = normalizeInstanceUrl(req.query.instanceUrl); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    try { return res.json({ removed: removeConnection(instanceUrl) }); }
    catch (error) { return fail(res, error); }
  });

  app.get('/api/gitea/repository', async (req, res) => {
    try {
      const resolved = await repositoryForRequest(req, res, resolveRepository);
      if (resolved) res.json({ repo: publicRepo(resolved) });
    } catch (error) { fail(res, error); }
  });

  app.get('/api/gitea/items', async (req, res) => {
    const kind = req.query.kind;
    const page = Number(req.query.page ?? 1);
    if (!['issue', 'pr'].includes(kind) || !Number.isInteger(page) || page < 1 || page > 1000) {
      return res.status(400).json({ error: 'Invalid kind or page' });
    }
    try {
      const resolved = await repositoryForRequest(req, res, resolveRepository);
      if (!resolved) return;
      const { connection, repo } = resolved;
      const resource = kind === 'pr' ? 'pulls' : 'issues';
      const params = new URLSearchParams({ state: 'open', page: String(page), limit: String(PAGE_SIZE) });
      if (kind === 'issue') params.set('type', 'issues');
      const { data: raw, hasNext } = await requestGiteaPage(connection,
        `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/${resource}?${params}`);
      if (!Array.isArray(raw)) throw new Error('Gitea returned an invalid list');
      const repoInfo = publicRepo(resolved);
      res.json({ repo: repoInfo, items: raw.map((entry) => itemFromApi(entry, kind, repoInfo)),
        page, hasMore: hasNext ?? raw.length === PAGE_SIZE });
    } catch (error) { fail(res, error); }
  });

  app.get('/api/gitea/item', async (req, res) => {
    const kind = req.query.kind;
    const number = Number(req.query.number);
    if (!['issue', 'pr'].includes(kind) || !Number.isInteger(number) || number < 1) {
      return res.status(400).json({ error: 'Invalid kind or number' });
    }
    try {
      const resolved = await repositoryForRequest(req, res, resolveRepository);
      if (!resolved) return;
      const { connection, repo } = resolved;
      const root = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
      const resource = kind === 'pr' ? 'pulls' : 'issues';
      const raw = await requestGitea(connection, `${root}/${resource}/${number}`);
      const comments = [];
      let commentsTruncated = false;
      for (let page = 1; page <= MAX_COMMENT_PAGES; page++) {
        const { data, hasNext } = await requestGiteaPage(connection,
          `${root}/issues/${number}/comments?limit=${COMMENT_PAGE_SIZE}&page=${page}`);
        const batch = commentsFromApi(data);
        const remaining = MAX_COMMENTS - comments.length;
        comments.push(...batch.slice(0, remaining));
        if (comments.length === MAX_COMMENTS) {
          commentsTruncated = batch.length > remaining || hasNext === true ||
            (hasNext === null && batch.length >= COMMENT_PAGE_SIZE);
          break;
        }
        if (hasNext === false || (hasNext === null && batch.length < COMMENT_PAGE_SIZE)) break;
        if (page === MAX_COMMENT_PAGES) commentsTruncated = true;
      }
      const repoInfo = publicRepo(resolved);
      res.json({ repo: repoInfo, item: itemFromApi(raw, kind, repoInfo), comments, commentsTruncated });
    } catch (error) { fail(res, error); }
  });

  app.get('/api/gitea/pull-diff', async (req, res) => {
    const number = Number(req.query.number);
    if (!Number.isInteger(number) || number < 1) return res.status(400).json({ error: 'Invalid pull request number' });
    try {
      const resolved = await repositoryForRequest(req, res, resolveRepository);
      if (!resolved) return;
      const { connection, repo } = resolved;
      const diff = await requestGitea(connection,
        `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pulls/${number}.diff`,
        { accept: 'text/plain' });
      res.type('text/plain').send(diff);
    } catch (error) { fail(res, error); }
  });
}
