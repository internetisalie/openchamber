import assert from 'node:assert/strict';
import { execFileSync, fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const image = process.env.OPENCODE_MIRROR_SMOKE_IMAGE;
const containerPort = Number(process.env.OPENCODE_MIRROR_SMOKE_CONTAINER_PORT);
const scratch = process.env.OPENCODE_MIRROR_SMOKE_SCRATCH;
assert.equal(process.env.OPENCODE_MIRROR_SMOKE_DISPOSABLE, '1', 'Set OPENCODE_MIRROR_SMOKE_DISPOSABLE=1 to run this disposable test');
assert.ok(image, 'Set OPENCODE_MIRROR_SMOKE_IMAGE to a locally built fork OpenCode v2 server image');
assert.ok(Number.isInteger(containerPort) && containerPort > 0 && containerPort <= 65535, 'Set OPENCODE_MIRROR_SMOKE_CONTAINER_PORT to the image server port');
assert.ok(scratch && path.isAbsolute(scratch), 'Set OPENCODE_MIRROR_SMOKE_SCRATCH to an absolute worktree scratch path');
assert.ok(path.relative(path.join(root, '.agent-scratch'), scratch).split(path.sep)[0] !== '..', 'Scratch must be inside this worktree .agent-scratch');
assert.ok(process.env.TMPDIR?.startsWith(path.join(root, '.agent-scratch') + path.sep), 'Run through run-with-worktree-scratch so tools cannot use host /tmp');

if (process.argv.includes('--server')) {
  const { startWebUiServer } = await import('../packages/web/server/index.js');
  const server = await startWebUiServer({ port: 0, host: '127.0.0.1' });
  process.send({ port: server.getPort() });
} else {
  const WebSocket = createRequire(new URL('../packages/web/package.json', import.meta.url))('ws');
  await fs.mkdir(scratch, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(scratch, 'run-'));
  const container = `openchamber-v2-mirror-${randomUUID()}`;
  const password = randomUUID();
  const authorization = `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`;
  const log = [];
  let child;
  let socket;
  let created = false;
  let failed = false;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const request = async (origin, route, body, authenticated = false) => {
    const headers = { 'content-type': 'application/json' };
    if (authenticated) headers.authorization = authorization;
    const response = await fetch(`${origin}${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const json = await response.json();
    assert.equal(response.status, 200, JSON.stringify(json));
    return json;
  };
  const ready = async (origin, authenticated = false) => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      try { return await request(origin, '/api/info', undefined, authenticated); } catch {}
      await sleep(100);
    }
    throw new Error('Disposable server did not become ready');
  };
  try {
    await fs.access(path.join(root, 'packages/sdk/dist/index.js'));
    await fs.access(path.join(root, 'packages/web/dist/index.html'));
    execFileSync('docker', ['run', '--rm', '-d', '--name', container, '--memory', '1536m', '--cpus', '2', '--pull', 'never', '-p', `127.0.0.1::${containerPort}`, '-e', `OPENCODE_SERVER_PASSWORD=${password}`, '-e', 'HOME=/state/home', '-e', 'XDG_DATA_HOME=/state/data', '-e', 'XDG_CONFIG_HOME=/state/config', '-e', 'XDG_STATE_HOME=/state/state', '-e', 'XDG_CACHE_HOME=/state/cache', '-e', 'TMPDIR=/state/tmp', image], { stdio: 'pipe' });
    created = true;
    const published = execFileSync('docker', ['port', container, `${containerPort}/tcp`], { encoding: 'utf8' }).trim();
    assert.match(published, /^127\.0\.0\.1:\d+$/);
    const upstream = `http://${published}`;
    assert.match((await ready(upstream, true)).version, /^2\./, 'The disposable image must run OpenCode v2');
    child = fork(fileURLToPath(import.meta.url), ['--server'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        HOME: path.join(fixture, 'home'),
        XDG_DATA_HOME: path.join(fixture, 'data'),
        XDG_CONFIG_HOME: path.join(fixture, 'config'),
        XDG_STATE_HOME: path.join(fixture, 'state'),
        XDG_CACHE_HOME: path.join(fixture, 'cache'),
        OPENCHAMBER_DATA_DIR: path.join(fixture, 'openchamber'),
        OPENCHAMBER_CHATS_DIR: path.join(fixture, 'chats'),
        OPENCODE_HOST: upstream,
        OPENCODE_SERVER_PASSWORD: password,
        OPENCODE_SKIP_START: 'true',
        OPENCHAMBER_SKIP_OPENCODE_START: 'true',
        OPENCHAMBER_RELAY_HOST: 'off',
        OPENCHAMBER_UI_PASSWORD: '',
      },
    });
    child.stdout.on('data', chunk => log.push(String(chunk)));
    child.stderr.on('data', chunk => log.push(String(chunk)));
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Disposable OpenChamber startup timed out')), 30000);
      child.once('message', message => { clearTimeout(timer); resolve(message.port); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Disposable OpenChamber exited with ${code}`)); });
    });
    assert.ok(Number.isInteger(port) && port > 0);
    const origin = `http://127.0.0.1:${port}`;
    await ready(origin);
    const events = [];
    socket = new WebSocket(`${origin.replace('http:', 'ws:')}/api/global/event/ws`, { origin });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('OpenChamber event bridge did not become ready')), 10000);
      socket.once('error', error => { clearTimeout(timer); reject(error); });
      socket.on('message', raw => {
        const frame = JSON.parse(String(raw));
        if (frame.type === 'ready') { clearTimeout(timer); resolve(); }
        if (frame.type === 'event') events.push(frame);
      });
    });
    const template = (await request(upstream, '/api/session', { title: 'Template' }, true)).data;
    const sessionID = `ses_smoke${Date.now()}`;
    const messageID = `msg_smoke${Date.now()}`;
    const initial = { source: 'disposable-bridge-smoke', info: { ...template, id: sessionID, title: 'Mirrored before', time: { ...template.time, updated: template.time.updated + 1000 } }, messages: [] };
    await request(upstream, '/api/experimental/session/mirror', initial, true);
    const final = { ...initial, info: { ...initial.info, title: 'Mirrored after', time: { ...initial.info.time, updated: initial.info.time.updated + 2000 } }, messages: [{ id: messageID, type: 'user', text: 'Settled leaf prompt', time: { created: initial.info.time.updated + 1 } }] };
    await request(upstream, '/api/experimental/session/mirror', final, true);
    const deadline = Date.now() + 10000;
    const mirrored = () => events.some(frame => frame.payload?.type === 'session.mirror.updated' && frame.payload.data.sessionID === sessionID);
    while (!mirrored() && Date.now() < deadline) await sleep(50);
    assert.ok(mirrored(), 'OpenChamber did not forward the mirror notice');
    assert.equal((await request(origin, `/api/session/${sessionID}`)).data.title, 'Mirrored after');
    const messages = (await request(origin, `/api/session/${sessionID}/message?limit=100`)).data;
    assert.equal(messages[0].id, messageID);
    assert.equal(messages[0].text, 'Settled leaf prompt');
    console.log('PASS: disposable OpenChamber forwards the v2 mirror event, session detail, and settled messages.');
  } catch (error) {
    failed = true;
    console.error(error);
    console.error(log.join('').slice(-6000));
    process.exitCode = 1;
  } finally {
    socket?.terminate();
    if (child && child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      await Promise.race([stopped, sleep(3000)]);
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await stopped; }
    }
    if (created) execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
    if (failed) await fs.writeFile(path.join(fixture, 'openchamber.log'), log.join(''));
    else await fs.rm(fixture, { recursive: true, force: true });
  }
}
