import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, test } from 'vitest';
import express from 'express';
import request from 'supertest';
import { normalizeInstanceUrl } from './instance.js';
import { matchRemoteToConnection, parseRemote } from './repo.js';
import { registerGiteaRoutes } from './routes.js';
import { readConnections, saveConnection } from './storage.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-gitea-'));
const previousDataDir = process.env.OPENCHAMBER_DATA_DIR;
const previousFetch = globalThis.fetch;
process.env.OPENCHAMBER_DATA_DIR = directory;

afterAll(() => {
  globalThis.fetch = previousFetch;
  if (previousDataDir === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
  else process.env.OPENCHAMBER_DATA_DIR = previousDataDir;
  fs.rmSync(directory, { recursive: true, force: true });
});

function appFor(resolved = null) {
  const app = express();
  registerGiteaRoutes(app, { resolveRepository: async () => resolved });
  return app;
}

test('instance URLs and remotes keep self-hosted instances separate', () => {
  assert.equal(normalizeInstanceUrl('https://git.example.com/team/'), 'https://git.example.com/team');
  assert.throws(() => normalizeInstanceUrl('https://token@git.example.com'), /without credentials/);
  const remote = parseRemote('git@git.example.com:team/alice/project.git');
  assert.deepEqual(remote, { protocol: 'ssh:', hostname: 'git.example.com', port: '',
    prefix: '/team', owner: 'alice', repo: 'project' });
  assert.equal(parseRemote('ssh://git@git.example.com/team/alice/project.git')?.repo, 'project');
  assert.equal(parseRemote('https://git.example.com/team/alice/project.git')?.repo, 'project');
  assert.equal(parseRemote('not a remote'), null);
  const first = { instanceUrl: 'https://git.example.com/team' };
  const second = { instanceUrl: 'https://git.example.com/other' };
  assert.equal(matchRemoteToConnection(remote, [first, second]), first);
  assert.equal(matchRemoteToConnection(remote, [second]), null);
  assert.equal(matchRemoteToConnection(remote, [first, first]), null);
  assert.equal(matchRemoteToConnection(parseRemote('https://git.example.com/team/alice/project.git'),
    [{ instanceUrl: 'http://git.example.com/team' }]), null);
});

test('token verification and connection storage never return the token', async () => {
  const app = appFor();
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.Authorization, 'token secret-one');
    assert.equal(options.redirect, 'manual');
    return Response.json({ login: 'alice' });
  };
  const created = await request(app).post('/api/gitea/connections')
    .send({ instanceUrl: 'https://git.example.com', token: 'secret-one' }).expect(200);
  assert.deepEqual(created.body, { instanceUrl: 'https://git.example.com', user: { login: 'alice' } });
  const listed = await request(app).get('/api/gitea/connections').expect(200);
  assert.deepEqual(listed.body.connections, [created.body]);
  assert.equal(fs.statSync(path.join(directory, 'gitea-auth.json')).mode & 0o777, 0o600);

  globalThis.fetch = async () => Response.json({ message: 'bad' }, { status: 401 });
  const invalid = await request(app).post('/api/gitea/connections')
    .send({ instanceUrl: 'https://git.example.com', token: 'wrong' }).expect(401);
  assert.match(invalid.body.error, /Reconnect in Integrations/);
  const afterFailure = await request(app).get('/api/gitea/connections').expect(200);
  assert.deepEqual(afterFailure.body.connections, [created.body]);

  await request(app).post('/api/gitea/connections')
    .send({ instanceUrl: 'http://git.example.com', token: 'wrong' }).expect(400);
  const removed = await request(app).delete('/api/gitea/connections')
    .query({ instanceUrl: 'https://git.example.com' }).expect(200);
  assert.deepEqual(removed.body, { removed: true });
});

test('malformed connection storage fails without replacing its contents', () => {
  const file = path.join(directory, 'gitea-auth.json');
  fs.writeFileSync(file, '{broken', { mode: 0o600 });
  assert.throws(() => readConnections(), /Could not read Gitea connections/);
  assert.throws(() => saveConnection({ instanceUrl: 'https://git.example.com', token: 'new-token',
    user: { login: 'alice' } }), /Could not read Gitea connections/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  fs.rmSync(file);
});

test('read routes keep repo identity and distinguish API failure from an empty page', async () => {
  const resolved = {
    connection: { instanceUrl: 'https://git.example.com', token: 'read-token' },
    repo: { owner: 'alice', name: 'project' }, remote: 'origin',
  };
  const app = appFor(resolved);
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, 'token read-token');
    if (String(url).includes('/issues/7/comments')) return Response.json([{ body: 'note', user: { login: 'bob' } }]);
    if (String(url).endsWith('/issues/7')) {
      return Response.json({ number: 7, title: 'Fix login', body: 'details', state: 'open',
        html_url: 'https://attacker.example/other', user: { login: 'alice' } });
    }
    return Response.json([]);
  };
  const list = await request(app).get('/api/gitea/items')
    .query({ directory: '/repo', kind: 'issue' }).expect(200);
  assert.deepEqual(list.body.items, []);
  assert.equal(list.body.repo.instanceUrl, 'https://git.example.com');
  const detail = await request(app).get('/api/gitea/item')
    .query({ directory: '/repo', kind: 'issue', number: 7 }).expect(200);
  assert.equal(detail.body.item.url, 'https://git.example.com/alice/project/issues/7');
  assert.deepEqual(detail.body.comments, [{ author: 'bob', body: 'note' }]);

  globalThis.fetch = async () => Response.json({ message: 'unavailable' }, { status: 503 });
  const failed = await request(app).get('/api/gitea/items')
    .query({ directory: '/repo', kind: 'issue' }).expect(502);
  assert.equal(Array.isArray(failed.body.items), false);

  globalThis.fetch = async () => Response.json({ message: 'hidden' }, { status: 403 });
  const denied = await request(app).get('/api/gitea/items')
    .query({ directory: '/repo', kind: 'issue' }).expect(403);
  assert.match(denied.body.error, /lacks permission/);
});

test('searched issues and PRs stay in the selected remote and use repository search', async () => {
  const first = { connection: { instanceUrl: 'https://one.example', token: 'first' },
    repo: { owner: 'team', name: 'same-name' }, remote: 'origin' };
  const second = { connection: { instanceUrl: 'https://two.example', token: 'second' },
    repo: { owner: 'team', name: 'same-name' }, remote: 'upstream' };
  const app = express();
  registerGiteaRoutes(app, { resolveRepository: async (_directory, remote) =>
    remote === 'upstream' ? second : first });
  const requested = [];
  globalThis.fetch = async (url, options) => {
    const address = String(url);
    requested.push(address);
    assert.ok(address.startsWith('https://two.example/api/v1/repos/team/same-name/issues?'));
    assert.equal(options.headers.Authorization, 'token second');
    const params = new URL(address).searchParams;
    assert.equal(params.get('q'), 'login fix');
    assert.equal(params.get('state'), 'open');
    assert.equal(params.get('type'), params.get('page') === '1' ? 'issues' : 'pulls');
    return Response.json([{ number: 7, title: 'Login fix', state: 'open' }], {
      headers: params.get('page') === '1' ? { Link: '<https://elsewhere.example/steal>; rel="next"' } : {},
    });
  };
  const issues = await request(app).get('/api/gitea/items').query({ directory: '/repo', remote: 'upstream',
    kind: 'issue', q: '  login fix  ' }).expect(200);
  assert.equal(issues.body.hasMore, true);
  assert.equal(issues.body.repo.instanceUrl, second.connection.instanceUrl);
  assert.equal(issues.body.repo.remote, 'upstream');
  assert.equal(issues.body.items[0].url, 'https://two.example/team/same-name/issues/7');
  const pulls = await request(app).get('/api/gitea/items').query({ directory: '/repo', remote: 'upstream',
    kind: 'pr', q: 'login fix', page: 2 }).expect(200);
  assert.equal(pulls.body.hasMore, false);
  assert.equal(pulls.body.items[0].kind, 'pr');
  assert.equal(pulls.body.items[0].url, 'https://two.example/team/same-name/pulls/7');
  assert.equal(requested.length, 2);
  await request(app).get('/api/gitea/items').query({ directory: '/repo', kind: 'issue', q: 'x'.repeat(257) }).expect(400);
  assert.equal(requested.length, 2);
});

test('creating a pull request posts only to the selected instance and source fork', async () => {
  const connection = { instanceUrl: 'https://git.example.com/team', token: 'write-token' };
  const target = { connection, repo: { owner: 'upstream', name: 'project' }, remote: 'upstream' };
  const source = { connection, repo: { owner: 'alice', name: 'project' }, remote: 'origin' };
  const app = express();
  registerGiteaRoutes(app, { resolveRepository: async (_directory, remote) =>
    remote === 'upstream' ? target : remote === 'origin' ? source : null });
  let posts = 0;
  globalThis.fetch = async (url, options) => {
    posts++;
    assert.equal(String(url), 'https://git.example.com/team/api/v1/repos/upstream/project/pulls');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'token write-token');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.equal(options.redirect, 'manual');
    assert.deepEqual(JSON.parse(options.body), {
      title: 'WIP: Fix login', head: 'alice:feature/login', base: 'feature/login', body: 'Details',
    });
    return Response.json({ number: 9, title: 'WIP: Fix login', body: 'Details', state: 'open',
      html_url: 'https://attacker.example/steal' }, { status: 201 });
  };
  const created = await request(app).post('/api/gitea/pr/create').send({
    directory: '/repo', remote: 'upstream', headRemote: 'origin', head: 'feature/login',
    base: 'feature/login', title: 'Fix login', body: 'Details', draft: true,
  }).expect(201);
  assert.equal(posts, 1);
  assert.deepEqual(created.body, {
    kind: 'pr', number: 9, title: 'WIP: Fix login', body: 'Details',
    url: 'https://git.example.com/team/upstream/project/pulls/9', state: 'open', author: null,
  });

  await request(app).post('/api/gitea/pr/create').send({ directory: '/repo', remote: 'upstream',
    headRemote: 'missing', head: 'feature/login', base: 'main', title: 'Fix login' }).expect(400);
  await request(app).post('/api/gitea/pr/create').send({ directory: '/repo', remote: 'origin',
    head: 'main', base: 'main', title: 'Fix login' }).expect(400);
  assert.equal(posts, 1);
});

test('pull request status identifies the source repository and preserves lookup failures', async () => {
  const connection = { instanceUrl: 'https://git.example.com', token: 'read-token' };
  const target = { connection, repo: { owner: 'upstream', name: 'project' }, remote: 'upstream' };
  const source = { connection, repo: { owner: 'alice', name: 'project' }, remote: 'origin' };
  const app = express();
  registerGiteaRoutes(app, { resolveRepository: async (_directory, remote) =>
    remote === 'upstream' ? target : remote === 'origin' ? source : null });
  globalThis.fetch = async (url) => {
    const page = new URL(url).searchParams.get('page');
    if (page === '1') return Response.json([], { headers: { Link: '<https://bad.example>; rel="next"' } });
    return Response.json([{ number: 12, title: 'Ready', state: 'open', head: {
      ref: 'feature/login', repo: { owner: { login: 'alice' }, name: 'project' },
    } }]);
  };
  const result = await request(app).get('/api/gitea/pr/status').query({
    directory: '/repo', remote: 'upstream', headRemote: 'origin', branch: 'feature/login',
  }).expect(200);
  assert.equal(result.body.item.number, 12);
  assert.equal(result.body.repo.owner, 'upstream');
  assert.deepEqual(result.body.pull, { draft: null, merged: null });
  assert.equal(result.body.historyIncomplete, false);

  globalThis.fetch = async () => Response.json({ message: 'forbidden' }, { status: 403 });
  const denied = await request(app).get('/api/gitea/pr/status').query({
    directory: '/repo', remote: 'upstream', headRemote: 'origin', branch: 'feature/login',
  }).expect(403);
  assert.equal('item' in denied.body, false);
});

test('pull request status finds recent closed history and reports an incomplete history scan', async () => {
  const resolved = {
    connection: { instanceUrl: 'https://git.example.com', token: 'read-token' },
    repo: { owner: 'alice', name: 'project' }, remote: 'origin',
  };
  const app = appFor(resolved);
  globalThis.fetch = async (url) => {
    const address = new URL(url);
    if (address.searchParams.get('state') === 'open') return Response.json([]);
    assert.equal(address.searchParams.get('sort'), 'recentclose');
    return Response.json([{ number: 18, title: 'Completed', state: 'closed', merged: true,
      draft: false, head: { ref: 'feature', repo: { owner: { login: 'alice' }, name: 'project' } } }]);
  };
  const historical = await request(app).get('/api/gitea/pr/status')
    .query({ directory: '/repo', branch: 'feature' }).expect(200);
  assert.equal(historical.body.item.number, 18);
  assert.deepEqual(historical.body.pull, { draft: false, merged: true });

  let closedPages = 0;
  globalThis.fetch = async (url) => {
    const address = new URL(url);
    if (address.searchParams.get('state') === 'open') return Response.json([]);
    closedPages++;
    return Response.json([], { headers: { Link: '<https://bad.example>; rel="next"' } });
  };
  const incomplete = await request(app).get('/api/gitea/pr/status')
    .query({ directory: '/repo', branch: 'feature' }).expect(200);
  assert.equal(incomplete.body.item, null);
  assert.equal(incomplete.body.historyIncomplete, true);
  assert.equal(closedPages, 2);
});

test('comment pages and pull diff stay with the matched instance', async () => {
  const resolved = {
    connection: { instanceUrl: 'https://git.example.com/team', token: 'read-token' },
    repo: { owner: 'alice', name: 'project' }, remote: 'origin',
  };
  const requested = [];
  globalThis.fetch = async (url, options) => {
    requested.push(String(url));
    assert.equal(options.headers.Authorization, 'token read-token');
    if (String(url).includes('comments?limit=50&page=1')) {
      return Response.json(Array.from({ length: 50 }, (_, i) => ({ body: `comment ${i + 1}` })));
    }
    if (String(url).includes('comments?limit=50&page=2')) return Response.json([{ body: 'comment 51' }]);
    if (String(url).endsWith('/pulls/7.diff')) return new Response('diff --git a/file b/file', { headers: { 'Content-Type': 'text/plain' } });
    return Response.json({ number: 7, title: 'Fix login', state: 'open' });
  };
  const app = appFor(resolved);
  const detail = await request(app).get('/api/gitea/item')
    .query({ directory: '/repo', kind: 'pr', number: 7 }).expect(200);
  assert.equal(detail.body.comments.length, 51);
  assert.equal(detail.body.commentsTruncated, false);
  assert.equal(detail.body.item.url, 'https://git.example.com/team/alice/project/pulls/7');
  assert.deepEqual(detail.body.pull, {
    draft: null, merged: null, sourceBranch: null, targetBranch: null, sourceOwner: null, headSha: null,
  });
  const diff = await request(app).get('/api/gitea/pull-diff')
    .query({ directory: '/repo', remote: 'origin', number: 7,
      instanceUrl: 'https://git.example.com/team', owner: 'alice', repo: 'project' }).expect(200);
  assert.equal(diff.text, 'diff --git a/file b/file');
  const requestCount = requested.length;
  await request(app).get('/api/gitea/pull-diff').query({ directory: '/repo', remote: 'origin', number: 7,
    instanceUrl: 'https://other.example', owner: 'alice', repo: 'project' }).expect(409);
  assert.equal(requested.length, requestCount);
  assert.ok(requested.every((url) => url.startsWith('https://git.example.com/team/api/v1/')));
});

test('pull detail and comments retain the matched repository and report write failures', async () => {
  const resolved = {
    connection: { instanceUrl: 'https://git.example.com/team', token: 'write-token' },
    repo: { owner: 'alice', name: 'project' }, remote: 'origin',
  };
  const app = appFor(resolved);
  globalThis.fetch = async (url, options) => {
    const address = String(url);
    assert.ok(address.startsWith('https://git.example.com/team/api/v1/repos/alice/project/'));
    assert.equal(options.headers.Authorization, 'token write-token');
    if (options.method === 'POST') {
      assert.equal(address.endsWith('/issues/7/comments'), true);
      assert.deepEqual(JSON.parse(options.body), { body: 'Looks good' });
      return Response.json({ body: 'Looks good', user: { login: 'alice' } }, { status: 201 });
    }
    if (address.includes('/comments?')) return Response.json([]);
    return Response.json({ number: 7, title: 'Fix login', body: 'Details', state: 'closed',
      draft: false, merged: true, user: { login: 'alice' },
      head: { ref: 'feature', repo: { owner: { login: 'alice' } } }, base: { ref: 'main' } });
  };
  const detail = await request(app).get('/api/gitea/item')
    .query({ directory: '/repo', remote: 'origin', kind: 'pr', number: 7 }).expect(200);
  assert.deepEqual(detail.body.pull, {
    draft: false, merged: true, sourceBranch: 'feature', targetBranch: 'main', sourceOwner: 'alice', headSha: null,
  });
  const input = { directory: '/repo', remote: 'origin', kind: 'pr', number: 7,
    body: 'Looks good', instanceUrl: 'https://git.example.com/team', owner: 'alice', repo: 'project' };
  const created = await request(app).post('/api/gitea/comment').send(input).expect(201);
  assert.deepEqual(created.body, { author: 'alice', body: 'Looks good' });
  await request(app).post('/api/gitea/comment').send({ ...input, body: ' ' }).expect(400);
  await request(app).post('/api/gitea/comment').send({ ...input, instanceUrl: 'https://other.example' }).expect(409);

  globalThis.fetch = async () => Response.json({ message: 'forbidden' }, { status: 403 });
  const denied = await request(app).post('/api/gitea/comment').send(input).expect(403);
  assert.match(denied.body.error, /lacks permission/);
});

test('short pages use Gitea pagination links without following their URLs', async () => {
  const resolved = {
    connection: { instanceUrl: 'https://git.example.com', token: 'read-token' },
    repo: { owner: 'alice', name: 'project' }, remote: 'origin',
  };
  const requested = [];
  globalThis.fetch = async (url) => {
    const address = String(url);
    requested.push(address);
    if (address.includes('/issues?')) {
      const page = new URL(address).searchParams.get('page');
      return Response.json([{ number: Number(page), title: `Issue ${page}` }], {
        headers: page === '1' ? { Link: '<https://elsewhere.example/steal>; rel="next"' } : {},
      });
    }
    if (address.includes('/issues/7/comments?')) {
      const page = new URL(address).searchParams.get('page');
      return Response.json([{ body: `comment ${page}` }], {
        headers: page === '1' ? { Link: '<https://elsewhere.example/steal>; rel="next"' } : {},
      });
    }
    return Response.json({ number: 7, title: 'Issue 7' });
  };
  const app = appFor(resolved);
  const first = await request(app).get('/api/gitea/items')
    .query({ directory: '/repo', kind: 'issue' }).expect(200);
  assert.equal(first.body.hasMore, true);
  const second = await request(app).get('/api/gitea/items')
    .query({ directory: '/repo', kind: 'issue', page: 2 }).expect(200);
  assert.equal(second.body.hasMore, false);
  const detail = await request(app).get('/api/gitea/item')
    .query({ directory: '/repo', kind: 'issue', number: 7 }).expect(200);
  assert.deepEqual(detail.body.comments.map((entry) => entry.body), ['comment 1', 'comment 2']);
  assert.equal(detail.body.commentsTruncated, false);
  assert.ok(requested.every((address) => address.startsWith('https://git.example.com/api/v1/')));
});

test('comment limits report partial content', async () => {
  const resolved = {
    connection: { instanceUrl: 'https://git.example.com', token: 'read-token' },
    repo: { owner: 'alice', name: 'project' }, remote: 'origin',
  };
  globalThis.fetch = async (url) => String(url).includes('/comments?')
    ? Response.json(Array.from({ length: 120 }, (_, i) => ({ body: `comment ${i}` })))
    : Response.json({ number: 7, title: 'Issue 7' });
  const detail = await request(appFor(resolved)).get('/api/gitea/item')
    .query({ directory: '/repo', kind: 'issue', number: 7 }).expect(200);
  assert.equal(detail.body.comments.length, 100);
  assert.equal(detail.body.commentsTruncated, true);
});

test('PR review comments and checks load independently with confirmed empty checks', async () => {
  const resolved = { connection: { instanceUrl: 'https://git.example.com', token: 'read-token' },
    repo: { owner: 'team', name: 'project' }, remote: 'origin' };
  const sha = 'a'.repeat(40);
  let statusPayload = { state: 'pending', total_count: 0, statuses: null };
  globalThis.fetch = async (url) => {
    const address = String(url);
    if (address.includes('/reviews/3/comments')) return Response.json([
      { id: 9, body: 'Please adjust this', path: 'src/app.ts', line: 12, user: { login: 'reviewer' } },
    ]);
    if (address.includes('/reviews?')) return Response.json([{ id: 3, user: { login: 'reviewer' } }]);
    if (address.endsWith(`/commits/${sha}/status`)) return Response.json(statusPayload);
    return Response.json({ number: 7, title: 'PR', head: { sha } });
  };
  const query = { directory: '/repo', remote: 'origin', number: 7,
    instanceUrl: 'https://git.example.com', owner: 'team', repo: 'project' };
  const app = appFor(resolved);
  const reviews = await request(app).get('/api/gitea/pr/reviews').query(query).expect(200);
  assert.deepEqual(reviews.body.comments, [{ id: 9, reviewId: 3, author: 'reviewer',
    body: 'Please adjust this', path: 'src/app.ts', line: 12 }]);
  const checks = await request(app).get('/api/gitea/pr/checks').query(query).expect(200);
  assert.deepEqual(checks.body, { state: 'pending', totalCount: 0, checks: [] });
  statusPayload = { state: 'failure', total_count: 1, statuses: [{ id: 4, context: 'ci/test',
    status: 'failure', description: 'Tests failed', target_url: 'https://ci.example/build/4' }] };
  const failed = await request(app).get('/api/gitea/pr/checks').query(query).expect(200);
  assert.deepEqual(failed.body, { state: 'failure', totalCount: 1, checks: [{ id: 4, name: 'ci/test',
    state: 'failure', description: 'Tests failed', url: 'https://ci.example/build/4' }] });
  await request(app).get('/api/gitea/pr/checks').query({ ...query, instanceUrl: 'https://elsewhere.example' }).expect(409);
});

test('PR actions recheck permissions, source identity and merge settings', async () => {
  const resolved = { connection: { instanceUrl: 'https://git.example.com', token: 'write-token',
    user: { login: 'author' } }, repo: { owner: 'team', name: 'project' }, remote: 'origin' };
  const sha = 'a'.repeat(40);
  let title = 'WIP: Feature';
  let merged = false;
  let canPush = true;
  let approvalBlocked = false;
  let patches = 0;
  globalThis.fetch = async (url, options) => {
    const address = String(url);
    if (address.endsWith('/repos/team/project')) return Response.json({ permissions: { push: canPush },
      allow_merge_commits: true, allow_squash_merge: false, archived: false });
    if (options.method === 'PATCH') {
      patches++;
      title = JSON.parse(options.body).title;
    }
    if (address.endsWith('/merge') && options.method === 'POST') {
      if (approvalBlocked) return Response.json({ message: 'Does not have enough approvals' }, { status: 405 });
      merged = true;
      return new Response('merged');
    }
    return Response.json({ number: 7, title, body: 'Body', state: merged ? 'closed' : 'open',
      draft: title.startsWith('WIP:'), merged, mergeable: !title.startsWith('WIP:'),
      user: { login: 'author' }, head: { sha, ref: 'feature', repo: { owner: { login: 'team' }, name: 'project' } },
      base: { ref: 'main' } });
  };
  const app = appFor(resolved);
  const identity = { directory: '/repo', remote: 'origin', sourceRemote: 'origin', sourceBranch: 'feature',
    number: 7, headSha: sha, instanceUrl: 'https://git.example.com', owner: 'team', repo: 'project' };
  const capabilities = await request(app).get('/api/gitea/pr/capabilities').query(identity).expect(200);
  assert.equal(capabilities.body.canMarkReady, true);
  assert.deepEqual(capabilities.body.mergeMethods, ['merge']);
  await request(app).post('/api/gitea/pr/ready').send({ ...identity, headSha: 'b'.repeat(40) }).expect(409);
  assert.equal(patches, 0);
  const ready = await request(app).post('/api/gitea/pr/ready').send(identity).expect(200);
  assert.equal(ready.body.item.title, 'Feature');
  assert.equal(ready.body.pull.draft, false);
  const edited = await request(app).patch('/api/gitea/pr').send({ ...identity, title: 'Feature updated', body: 'Body' }).expect(200);
  assert.equal(edited.body.item.title, 'Feature updated');
  await request(app).post('/api/gitea/pr/merge').send({ ...identity, method: 'squash' }).expect(409);
  canPush = false;
  await request(app).post('/api/gitea/pr/merge').send({ ...identity, method: 'merge' }).expect(403);
  const readOnly = appFor({ ...resolved, connection: { ...resolved.connection, user: { login: 'reader' } } });
  await request(readOnly).patch('/api/gitea/pr').send({ ...identity, title: 'Denied', body: 'Body' }).expect(403);
  canPush = true;
  approvalBlocked = true;
  const blocked = await request(app).post('/api/gitea/pr/merge').send({ ...identity, method: 'merge' }).expect(409);
  assert.match(blocked.body.error, /needs more approvals/);
  approvalBlocked = false;
  const result = await request(app).post('/api/gitea/pr/merge').send({ ...identity, method: 'merge' }).expect(200);
  assert.equal(result.body.pull.merged, true);
  assert.equal(result.body.item.state, 'closed');
});

test('PR writes reject a remote that now resolves to another repository', async () => {
  const original = { connection: { instanceUrl: 'https://git.example.com', token: 'token' },
    repo: { owner: 'team', name: 'project' }, remote: 'origin' };
  let resolved = original;
  const app = express();
  registerGiteaRoutes(app, { resolveRepository: async () => resolved });
  resolved = { ...original, repo: { owner: 'other', name: 'project' } };
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('must not contact Gitea'); };
  const denied = await request(app).patch('/api/gitea/pr').send({ directory: '/repo', remote: 'origin',
    sourceRemote: 'origin', sourceBranch: 'feature', headSha: 'a'.repeat(40), number: 7,
    instanceUrl: 'https://git.example.com', owner: 'team', repo: 'project',
    title: 'Unrelated', body: '' }).expect(409);
  assert.match(denied.body.error, /repository changed/);
  assert.equal(called, false);
});
