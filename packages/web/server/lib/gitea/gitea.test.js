import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
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

after(() => {
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
  assert.match(denied.body.error, /does not have access/);
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
  const diff = await request(app).get('/api/gitea/pull-diff')
    .query({ directory: '/repo', number: 7 }).expect(200);
  assert.equal(diff.text, 'diff --git a/file b/file');
  assert.ok(requested.every((url) => url.startsWith('https://git.example.com/team/api/v1/')));
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
