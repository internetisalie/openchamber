import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareForkOpenCodeCli } from './prepare-fork-opencode-cli.mjs';

const version = '2.0.32-internetisalie.1';
const fixture = (t, reportedVersion = version) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fork-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cacheRoot = path.join(root, 'cache');
  const cache = path.join(cacheRoot, version, 'linux-x64', 'opencode');
  const outputBinary = path.join(root, 'staged', 'opencode');
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, `#!/bin/sh\nprintf 'opencode v${reportedVersion}\\n'\n`, { mode: 0o755 });
  return {
    version, platform: 'linux', architecture: 'x64', cacheRoot, outputBinary,
    sha256: createHash('sha256').update(fs.readFileSync(cache)).digest('hex'),
    cache,
  };
};

test('stages the verified cached fork and rechecks an already-staged copy', async (t) => {
  const options = fixture(t);
  await prepareForkOpenCodeCli(options);
  assert.deepEqual(fs.readFileSync(options.outputBinary), fs.readFileSync(options.cache));
  fs.rmSync(options.cache);
  await prepareForkOpenCodeCli(options);
  assert.equal(fs.existsSync(options.cache), false);
});

test('rejects corrupt cache bytes and preserves the previous staged binary', async (t) => {
  const options = fixture(t);
  fs.mkdirSync(path.dirname(options.outputBinary), { recursive: true });
  fs.writeFileSync(options.outputBinary, 'previous artifact');
  fs.appendFileSync(options.cache, '# corrupt\n');
  await assert.rejects(prepareForkOpenCodeCli(options), /SHA-256 mismatch/);
  assert.equal(fs.readFileSync(options.outputBinary, 'utf8'), 'previous artifact');
});

test('repairs a staged binary with the right version but wrong bytes', async (t) => {
  const options = fixture(t);
  fs.mkdirSync(path.dirname(options.outputBinary), { recursive: true });
  fs.writeFileSync(options.outputBinary, `#!/bin/sh\nprintf 'opencode v${version}\\n'\n# different\n`, { mode: 0o755 });
  await prepareForkOpenCodeCli(options);
  assert.deepEqual(fs.readFileSync(options.outputBinary), fs.readFileSync(options.cache));
});

test('rejects a hash-matching binary that reports a different version', async (t) => {
  const options = fixture(t, '2.0.18');
  await assert.rejects(prepareForkOpenCodeCli(options), /version mismatch/);
  assert.equal(fs.existsSync(options.outputBinary), false);
});

test('fails closed for missing pins and unreleased platforms before using the cache', async (t) => {
  const options = fixture(t);
  for (const overrides of [{ sha256: undefined }, { sha256: 'bad' }, { version: '../../bad' }, { platform: 'darwin' }, { architecture: 'arm64' }]) {
    await assert.rejects(prepareForkOpenCodeCli({ ...options, ...overrides }));
    assert.equal(fs.existsSync(options.outputBinary), false);
  }
});
