import express from 'express';
import { z } from 'zod';
import { GiteaRequestError, requestGitea, requestGiteaPage, verifyConnection } from './client.js';
import { normalizeInstanceUrl } from './instance.js';
import { resolveGiteaRepo } from './repo.js';
import { publicConnections, removeConnection, saveConnection } from './storage.js';

const parseBody = express.json({ limit: '256kb' });
const PAGE_SIZE = 30;
const COMMENT_PAGE_SIZE = 50;
const MAX_COMMENTS = 100;
const MAX_COMMENT_PAGES = 10;
const MAX_CLOSED_STATUS_PAGES = 2;
const MAX_REVIEWS = 100;
const text = z.string();
const optionalText = (value) => {
  const parsed = text.safeParse(value);
  return parsed.success ? parsed.data : null;
};
const optionalBoolean = (value) => {
  const parsed = z.boolean().safeParse(value);
  return parsed.success ? parsed.data : null;
};
const apiItemSchema = z.object({
  number: z.number().int().positive().nullish(),
  index: z.number().int().positive().nullish(),
  title: z.string(),
});
const apiCommentsSchema = z.array(z.object({
  body: z.string().nullish(),
  user: z.object({ login: z.string().nullish() }).nullish(),
}));

function fail(res, error) {
  if (error instanceof GiteaRequestError) {
    const status = error.status === 405 ? 409 : [401, 403, 404, 409, 422].includes(error.status) ? error.status : 502;
    return res.status(status).json({ error: error.message });
  }
  return res.status(502).json({ error: error instanceof Error ? error.message : 'Gitea request failed' });
}

function directoryFromRequest(req) {
  return optionalText(req.query.directory)?.trim() ?? '';
}

async function repositoryForRequest(req, res, resolveRepository) {
  const directory = optionalText(req.body?.directory)?.trim() || directoryFromRequest(req);
  if (!directory) {
    res.status(400).json({ error: 'directory is required' });
    return null;
  }
  const remote = (optionalText(req.body?.remote) ?? optionalText(req.query.remote) ?? '').trim();
  const resolved = await resolveRepository(directory, remote || undefined);
  if (!resolved) {
    res.status(404).json({ error: 'No connected Gitea instance matches a Git remote in this directory' });
    return null;
  }
  return resolved;
}

const branchSchema = z.string().min(1).max(255)
  .regex(/^[^\x00-\x1f\x7f:]+$/)
  .refine((value) => value.trim() === value && !value.includes('..'));
const createPullRequestSchema = z.object({
  directory: z.string().trim().min(1),
  remote: z.string().trim().min(1).optional(),
  headRemote: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(300),
  head: branchSchema,
  base: branchSchema,
  body: z.string().max(60_000).optional(),
  draft: z.boolean().optional(),
});
const pullRequestStatusSchema = z.object({
  branch: branchSchema,
  headRemote: z.string().trim().min(1).optional(),
});
const listItemsSchema = z.object({
  kind: z.enum(['issue', 'pr']),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  q: z.string().trim().max(256).optional(),
});
const commentSchema = z.object({
  directory: z.string().trim().min(1),
  remote: z.string().trim().min(1),
  kind: z.enum(['issue', 'pr']),
  number: z.number().int().positive(),
  body: z.string().trim().min(1).max(60_000),
  instanceUrl: z.string().url(),
  owner: z.string().min(1),
  repo: z.string().min(1),
});
const pullSectionSchema = z.object({
  directory: z.string().trim().min(1),
  remote: z.string().trim().min(1),
  number: z.coerce.number().int().positive(),
  instanceUrl: z.string().url(),
  owner: z.string().min(1),
  repo: z.string().min(1),
});
const pullActionIdentitySchema = pullSectionSchema.extend({
  headSha: z.string().regex(/^[a-f0-9]{40,64}$/i),
  sourceRemote: z.string().trim().min(1),
  sourceBranch: branchSchema,
});
const editPullSchema = pullActionIdentitySchema.extend({
  title: z.string().trim().min(1).max(300), body: z.string().max(60_000),
});
const mergePullSchema = pullActionIdentitySchema.extend({
  method: z.enum(['merge', 'rebase', 'rebase-merge', 'squash', 'fast-forward-only']),
});
const MERGE_SETTINGS = {
  merge: 'allow_merge_commits', rebase: 'allow_rebase',
  'rebase-merge': 'allow_rebase_explicit', squash: 'allow_squash_merge',
  'fast-forward-only': 'allow_fast_forward_only_merge',
};

function publicRepo({ connection, repo, remote }) {
  return { instanceUrl: connection.instanceUrl, owner: repo.owner, name: repo.name, remote };
}

function itemFromApi(raw, kind, repo) {
  const parsed = apiItemSchema.safeParse(raw);
  const number = parsed.success ? parsed.data.number ?? parsed.data.index : null;
  if (!number) {
    throw new Error('Gitea returned an invalid issue or pull request');
  }
  const url = `${repo.instanceUrl}/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/${kind === 'pr' ? 'pulls' : 'issues'}/${number}`;
  return {
    kind, number, title: parsed.data.title, body: optionalText(raw.body) ?? '',
    url, state: raw.state === 'closed' ? 'closed' : 'open',
    author: optionalText(raw.user?.login),
  };
}

function commentsFromApi(raw) {
  const parsed = apiCommentsSchema.safeParse(raw);
  if (!parsed.success) throw new Error('Gitea returned invalid comments');
  return parsed.data.map((entry) => ({
    author: entry.user?.login ?? null,
    body: entry.body ?? '',
  }));
}

function pullDetailFromApi(raw) {
  return {
    draft: optionalBoolean(raw?.draft),
    merged: optionalBoolean(raw?.merged),
    sourceBranch: optionalText(raw?.head?.ref),
    targetBranch: optionalText(raw?.base?.ref),
    sourceOwner: optionalText(raw?.head?.repo?.owner?.login),
    headSha: optionalText(raw?.head?.sha),
  };
}

async function confirmedPull(req, res, resolveRepository) {
  const parsed = pullSectionSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid pull request identity' });
    return null;
  }
  const resolved = await repositoryForRequest(req, res, resolveRepository);
  if (!resolved) return null;
  const { instanceUrl, owner, repo, number } = parsed.data;
  if (resolved.connection.instanceUrl !== instanceUrl || resolved.repo.owner !== owner ||
      resolved.repo.name !== repo) {
    res.status(409).json({ error: 'The Gitea repository changed. Reopen the pull request.' });
    return null;
  }
  const root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const pull = await requestGitea(resolved.connection, `${root}/pulls/${number}`);
  return { ...resolved, root, number, pull };
}

async function confirmedWritablePull(req, res, resolveRepository, identity, action) {
  const resolved = await repositoryForRequest(req, res, resolveRepository);
  if (!resolved) return null;
  if (resolved.connection.instanceUrl !== identity.instanceUrl || resolved.repo.owner !== identity.owner ||
      resolved.repo.name !== identity.repo) {
    res.status(409).json({ error: 'The Gitea repository changed. Reopen the pull request.' });
    return null;
  }
  const source = await resolveRepository(identity.directory, identity.sourceRemote);
  if (!source || source.connection.instanceUrl !== identity.instanceUrl ||
      source.repo.name !== resolved.repo.name) {
    res.status(409).json({ error: 'The Gitea source remote changed. Reopen the pull request.' });
    return null;
  }
  const root = `/repos/${encodeURIComponent(identity.owner)}/${encodeURIComponent(identity.repo)}`;
  const [pull, repository] = await Promise.all([
    requestGitea(resolved.connection, `${root}/pulls/${identity.number}`),
    requestGitea(resolved.connection, root),
  ]);
  if (pull?.head?.sha !== identity.headSha || pull?.head?.ref !== identity.sourceBranch ||
      pull?.head?.repo?.owner?.login !== source.repo.owner || pull?.head?.repo?.name !== source.repo.name) {
    res.status(409).json({ error: 'The pull request source changed. Refresh before continuing.' });
    return null;
  }
  if (pull?.state !== 'open') {
    res.status(409).json({ error: 'This pull request is no longer open.' });
    return null;
  }
  const canEdit = repository?.permissions?.push === true || repository?.permissions?.admin === true ||
    pull?.user?.login === resolved.connection.user?.login;
  const canMerge = repository?.permissions?.push === true || repository?.permissions?.admin === true;
  if (repository?.archived === true || (action === 'merge' ? !canMerge : !canEdit)) {
    res.status(403).json({ error: 'This account cannot change this pull request.' });
    return null;
  }
  return { ...resolved, root, pull, repository };
}

export function registerGiteaRoutes(app, { resolveRepository = resolveGiteaRepo } = {}) {
  app.get('/api/gitea/connections', (_req, res) => {
    try { res.json({ connections: publicConnections() }); } catch (error) { fail(res, error); }
  });

  app.post('/api/gitea/connections', parseBody, async (req, res) => {
    const { instanceUrl, token, allowHttp } = req.body ?? {};
    const parsedToken = z.string().trim().min(1).max(2048).safeParse(token);
    if (!parsedToken.success) {
      return res.status(400).json({ error: 'A personal access token is required' });
    }
    let normalized;
    try { normalized = normalizeInstanceUrl(instanceUrl); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    if (normalized.startsWith('http://') && allowHttp !== true) {
      return res.status(400).json({ error: 'Confirm the use of HTTP for this instance' });
    }
    try {
      const connection = await verifyConnection(normalized, parsedToken.data);
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

  app.post('/api/gitea/pr/create', parseBody, async (req, res) => {
    const parsed = createPullRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid pull request details' });
    }
    const { directory, headRemote, title, head, base, body, draft } = parsed.data;
    try {
      const resolved = await repositoryForRequest(req, res, resolveRepository);
      if (!resolved) return;
      const source = headRemote && headRemote !== resolved.remote
        ? await resolveRepository(directory.trim(), headRemote.trim()) : resolved;
      if (!source || source.connection.instanceUrl !== resolved.connection.instanceUrl ||
          source.repo.name !== resolved.repo.name) {
        return res.status(400).json({ error: 'The source remote must be a fork on the same Gitea instance' });
      }
      if (source.repo.owner === resolved.repo.owner && head === base) {
        return res.status(400).json({ error: 'The source and target branches must differ' });
      }
      const headRef = source.repo.owner === resolved.repo.owner ? head : `${source.repo.owner}:${head}`;
      const prTitle = draft && !/^(?:WIP:|\[WIP\])/i.test(title.trim()) ? `WIP: ${title.trim()}` : title.trim();
      const { connection, repo } = resolved;
      const raw = await requestGitea(connection,
        `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pulls`,
        { method: 'POST', body: { title: prTitle, head: headRef, base, body: body ?? '' } });
      const publicItem = itemFromApi(raw, 'pr', publicRepo(resolved));
      return res.status(201).json(publicItem);
    } catch (error) { return fail(res, error); }
  });

  app.get('/api/gitea/pr/status', async (req, res) => {
    const parsed = pullRequestStatusSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid branch' });
    const { branch, headRemote } = parsed.data;
    try {
      const resolved = await repositoryForRequest(req, res, resolveRepository);
      if (!resolved) return;
      const source = headRemote && headRemote !== resolved.remote
        ? await resolveRepository(directoryFromRequest(req), headRemote) : resolved;
      if (!source || source.connection.instanceUrl !== resolved.connection.instanceUrl ||
          source.repo.name !== resolved.repo.name) {
        return res.status(400).json({ error: 'The source remote must be a fork on the same Gitea instance' });
      }
      const { connection, repo } = resolved;
      const root = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
      const publicRepository = publicRepo(resolved);
      for (const state of ['open', 'closed']) {
        const maxPages = state === 'closed' ? MAX_CLOSED_STATUS_PAGES : 10;
        for (let page = 1; page <= maxPages; page++) {
          const sort = state === 'closed' ? '&sort=recentclose' : '';
          const { data, hasNext } = await requestGiteaPage(connection,
            `${root}/pulls?state=${state}&limit=50&page=${page}${sort}`);
          if (!Array.isArray(data)) throw new Error('Gitea returned an invalid pull request list');
          const found = data.find((raw) => raw?.head?.ref === branch &&
            raw?.head?.repo?.owner?.login === source.repo.owner && raw?.head?.repo?.name === source.repo.name);
          if (found) return res.json({ repo: publicRepository,
            item: itemFromApi(found, 'pr', publicRepository),
            pull: { draft: optionalBoolean(found.draft), merged: optionalBoolean(found.merged) },
            historyIncomplete: false });
          if (hasNext === false || (hasNext === null && data.length < 50)) break;
          if (page === maxPages) {
            if (state === 'open') throw new Error('Gitea has more open pull requests than can be checked for this branch');
            return res.json({ repo: publicRepository, item: null, pull: null, historyIncomplete: true });
          }
        }
      }
      return res.json({ repo: publicRepository, item: null, pull: null, historyIncomplete: false });
    } catch (error) { return fail(res, error); }
  });

  app.get('/api/gitea/items', async (req, res) => {
    const parsed = listItemsSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid kind, page, or search query' });
    const { kind, page } = parsed.data;
    const query = parsed.data.q || '';
    try {
      const resolved = await repositoryForRequest(req, res, resolveRepository);
      if (!resolved) return;
      const { connection, repo } = resolved;
      const resource = kind === 'pr' && !query ? 'pulls' : 'issues';
      const params = new URLSearchParams({ state: 'open', page: String(page), limit: String(PAGE_SIZE) });
      if (resource === 'issues') params.set('type', kind === 'pr' ? 'pulls' : 'issues');
      if (query) params.set('q', query);
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
      res.json({ repo: repoInfo, item: itemFromApi(raw, kind, repoInfo),
        pull: kind === 'pr' ? pullDetailFromApi(raw) : null,
        comments, commentsTruncated });
    } catch (error) { fail(res, error); }
  });

  app.get('/api/gitea/pr/reviews', async (req, res) => {
    try {
      const resolved = await confirmedPull(req, res, resolveRepository);
      if (!resolved) return;
      const { connection, root, number } = resolved;
      const reviews = [];
      let truncated = false;
      for (let page = 1; page <= MAX_COMMENT_PAGES; page++) {
        const { data, hasNext } = await requestGiteaPage(connection,
          `${root}/pulls/${number}/reviews?limit=${COMMENT_PAGE_SIZE}&page=${page}`);
        if (!Array.isArray(data)) throw new Error('Gitea returned invalid reviews');
        for (const entry of data) {
          if (!Number.isInteger(entry?.id) || entry.id < 1) throw new Error('Gitea returned an invalid review');
          reviews.push(entry);
          if (reviews.length === MAX_REVIEWS) break;
        }
        if (reviews.length === MAX_REVIEWS) {
          truncated = data.length > COMMENT_PAGE_SIZE || hasNext === true;
          break;
        }
        if (hasNext === false || (hasNext === null && data.length < COMMENT_PAGE_SIZE)) break;
        if (page === MAX_COMMENT_PAGES) truncated = true;
      }
      const result = [];
      for (const review of reviews) {
        const { data } = await requestGiteaPage(connection,
          `${root}/pulls/${number}/reviews/${review.id}/comments?limit=${COMMENT_PAGE_SIZE}&page=1`);
        if (!Array.isArray(data)) throw new Error('Gitea returned invalid review comments');
        for (const entry of data) {
          result.push({ id: Number.isInteger(entry?.id) ? entry.id : null,
            reviewId: review.id, author: optionalText(entry?.user?.login) ?? optionalText(review.user?.login),
            body: optionalText(entry?.body) ?? '', path: optionalText(entry?.path),
            line: Number.isInteger(entry?.line) ? entry.line : null });
        }
        if (data.length === COMMENT_PAGE_SIZE) truncated = true;
      }
      res.json({ comments: result, truncated });
    } catch (error) { fail(res, error); }
  });

  app.get('/api/gitea/pr/checks', async (req, res) => {
    try {
      const resolved = await confirmedPull(req, res, resolveRepository);
      if (!resolved) return;
      const sha = optionalText(resolved.pull?.head?.sha);
      if (!sha || !/^[a-f0-9]{40,64}$/i.test(sha)) throw new Error('Gitea did not return a valid PR head commit');
      const raw = await requestGitea(resolved.connection, `${resolved.root}/commits/${sha}/status`);
      if (!Number.isInteger(raw?.total_count) || raw.total_count < 0 ||
          !Array.isArray(raw.statuses) && raw.statuses !== null) {
        throw new Error('Gitea returned invalid commit statuses');
      }
      const statuses = raw.statuses ?? [];
      res.json({ state: optionalText(raw.state) ?? 'unknown', totalCount: raw.total_count,
        checks: statuses.map((entry) => ({
          id: Number.isInteger(entry?.id) ? entry.id : null,
          name: optionalText(entry?.context) ?? 'Unnamed check',
          state: optionalText(entry?.status) ?? 'unknown',
          description: optionalText(entry?.description),
          url: optionalText(entry?.target_url),
        })) });
    } catch (error) { fail(res, error); }
  });

  app.get('/api/gitea/pr/capabilities', async (req, res) => {
    try {
      const resolved = await confirmedPull(req, res, resolveRepository);
      if (!resolved) return;
      const repository = await requestGitea(resolved.connection, resolved.root);
      const canEdit = repository?.permissions?.push === true || repository?.permissions?.admin === true ||
        resolved.pull?.user?.login === resolved.connection.user?.login;
      const canMerge = repository?.permissions?.push === true || repository?.permissions?.admin === true;
      const open = resolved.pull?.state === 'open' && repository?.archived !== true;
      const methods = Object.entries(MERGE_SETTINGS).filter(([, field]) => repository?.[field] === true)
        .map(([method]) => method);
      res.json({ canEdit: open && canEdit, canMarkReady: open && canEdit &&
        resolved.pull?.draft === true && /^(?:WIP:|\[WIP\])\s*/i.test(resolved.pull?.title ?? ''),
        canMerge: open && canMerge && resolved.pull?.draft !== true && resolved.pull?.mergeable === true,
        mergeMethods: methods });
    } catch (error) { fail(res, error); }
  });

  app.patch('/api/gitea/pr', parseBody, async (req, res) => {
    const parsed = editPullSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid pull request edit' });
    try {
      const resolved = await confirmedWritablePull(req, res, resolveRepository, parsed.data, 'edit');
      if (!resolved) return;
      const raw = await requestGitea(resolved.connection, `${resolved.root}/pulls/${parsed.data.number}`,
        { method: 'PATCH', body: { title: parsed.data.title, body: parsed.data.body } });
      return res.json({ repo: publicRepo(resolved), item: itemFromApi(raw, 'pr', publicRepo(resolved)),
        pull: pullDetailFromApi(raw) });
    } catch (error) { return fail(res, error); }
  });

  app.post('/api/gitea/pr/ready', parseBody, async (req, res) => {
    const parsed = pullActionIdentitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid pull request identity' });
    try {
      const resolved = await confirmedWritablePull(req, res, resolveRepository, parsed.data, 'edit');
      if (!resolved) return;
      const title = resolved.pull?.title?.replace(/^(?:WIP:|\[WIP\])\s*/i, '');
      if (resolved.pull?.draft !== true || !title || title === resolved.pull.title) {
        return res.status(409).json({ error: 'This Gitea draft cannot be marked ready from its title.' });
      }
      const raw = await requestGitea(resolved.connection, `${resolved.root}/pulls/${parsed.data.number}`,
        { method: 'PATCH', body: { title } });
      if (raw?.draft !== false) throw new Error('Gitea did not confirm that the pull request is ready');
      return res.json({ repo: publicRepo(resolved), item: itemFromApi(raw, 'pr', publicRepo(resolved)),
        pull: pullDetailFromApi(raw) });
    } catch (error) { return fail(res, error); }
  });

  app.post('/api/gitea/pr/merge', parseBody, async (req, res) => {
    const parsed = mergePullSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid merge request' });
    try {
      const resolved = await confirmedWritablePull(req, res, resolveRepository, parsed.data, 'merge');
      if (!resolved) return;
      if (resolved.repository?.[MERGE_SETTINGS[parsed.data.method]] !== true) {
        return res.status(409).json({ error: 'This merge method is disabled for the repository.' });
      }
      if (resolved.pull?.draft === true || resolved.pull?.mergeable !== true) {
        return res.status(409).json({ error: 'This pull request is not ready to merge.' });
      }
      await requestGitea(resolved.connection, `${resolved.root}/pulls/${parsed.data.number}/merge`,
        { method: 'POST', body: { do: parsed.data.method }, accept: 'text/plain' });
      const raw = await requestGitea(resolved.connection, `${resolved.root}/pulls/${parsed.data.number}`);
      if (raw?.merged !== true) throw new Error('Gitea did not confirm the merge');
      return res.json({ repo: publicRepo(resolved), item: itemFromApi(raw, 'pr', publicRepo(resolved)),
        pull: pullDetailFromApi(raw) });
    } catch (error) { return fail(res, error); }
  });

  app.post('/api/gitea/comment', parseBody, async (req, res) => {
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid comment details' });
    try {
      const resolved = await repositoryForRequest(req, res, resolveRepository);
      if (!resolved) return;
      const { instanceUrl, owner, repo, number, body } = parsed.data;
      if (resolved.connection.instanceUrl !== instanceUrl || resolved.repo.owner !== owner ||
          resolved.repo.name !== repo) {
        return res.status(409).json({ error: 'The Gitea repository changed. Reopen the item before commenting.' });
      }
      const root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
      const raw = await requestGitea(resolved.connection, `${root}/issues/${number}/comments`,
        { method: 'POST', body: { body } });
      if (!z.object({ body: z.string() }).safeParse(raw).success) {
        throw new Error('Gitea returned an invalid comment');
      }
      const [comment] = commentsFromApi([raw]);
      return res.status(201).json(comment);
    } catch (error) { return fail(res, error); }
  });

  app.get('/api/gitea/pull-diff', async (req, res) => {
    const number = Number(req.query.number);
    if (!Number.isInteger(number) || number < 1) return res.status(400).json({ error: 'Invalid pull request number' });
    const hasExpectedRepo = ['instanceUrl', 'owner', 'repo'].some((field) => req.query[field] !== undefined);
    const expectedRepo = hasExpectedRepo ? z.object({
      instanceUrl: z.string().url(), owner: z.string().min(1), repo: z.string().min(1),
    }).safeParse(req.query) : null;
    if (expectedRepo && !expectedRepo.success) return res.status(400).json({ error: 'Invalid repository identity' });
    try {
      const resolved = await repositoryForRequest(req, res, resolveRepository);
      if (!resolved) return;
      const { connection, repo } = resolved;
      if (expectedRepo?.success && (connection.instanceUrl !== expectedRepo.data.instanceUrl ||
          repo.owner !== expectedRepo.data.owner || repo.name !== expectedRepo.data.repo)) {
        return res.status(409).json({ error: 'The Gitea repository changed. Reopen the item before attaching it.' });
      }
      const diff = await requestGitea(connection,
        `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pulls/${number}.diff`,
        { accept: 'text/plain' });
      res.type('text/plain').send(diff);
    } catch (error) { fail(res, error); }
  });
}
