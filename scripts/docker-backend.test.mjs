import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
const electron = JSON.parse(readFileSync(new URL('../packages/electron/package.json', import.meta.url), 'utf8'));
const pin = /^ENV OPENCODE_VERSION=(\S+) \\\n    OPENCODE_SHA256=(\S+)$/m.exec(dockerfile);
const verificationStage = dockerfile.split('FROM opencode-pin AS opencode-verified\n')[1]?.split('\nFROM ')[0];
const verification = /^RUN ([\s\S]+)$/m.exec(verificationStage ?? '')?.[1].replace(/\\\n\s*/g, ' ');

test('Docker uses one concrete numbered fork version and SHA-256 matching Electron', () => {
  assert.ok(pin, 'Missing authoritative Docker backend pin');
  assert.match(pin[1], /^\d+\.\d+\.\d+-internetisalie\.[1-9]\d*$/);
  assert.match(pin[2], /^[a-f0-9]{64}$/);
  assert.notEqual(pin[2], '0'.repeat(64));
  assert.equal(pin[1], electron.opencodeCli.version);
  assert.equal(pin[2], electron.opencodeCli.sha256);
  assert.equal((dockerfile.match(/^ENV OPENCODE_VERSION=/gm) ?? []).length, 1);
  assert.equal((dockerfile.match(/^\s*OPENCODE_SHA256=/gm) ?? []).length, 1);
  assert.doesNotMatch(dockerfile, /^ARG OPENCODE_(?:VERSION|SHA256)(?:=|\s|$)/m);
});

test('released download is the default and both inputs reach the shared verification stage', () => {
  assert.match(dockerfile, /^ARG OPENCODE_SOURCE=opencode-release$/m);
  assert.match(dockerfile, /^FROM opencode-pin AS opencode-release\nADD --checksum=sha256:\$\{OPENCODE_SHA256\} --chmod=755 https:\/\/github\.com\/internetisalie\/opencode\/releases\/download\/v\$\{OPENCODE_VERSION\}\/opencode-linux-x64-baseline \/opencode$/m);
  assert.match(dockerfile, /^FROM \$\{OPENCODE_SOURCE\} AS opencode-artifact$/m);
  assert.match(verificationStage ?? '', /^COPY --from=opencode-artifact --chmod=755 \/opencode \.\/opencode$/m);
  assert.match(dockerfile, /^COPY --from=opencode-verified --chmod=755 \/backend\/opencode \/usr\/local\/bin\/opencode$/m);
  const runtime = dockerfile.split(' AS runtime\n')[1];
  assert.ok(runtime);
  assert.doesNotMatch(runtime, /^ADD |^COPY --from=opencode-(?:artifact|release)\s/gm);
});

const candidate = (version) => `#!/bin/sh\nprintf executed > candidate-executed\nprintf '%s\\n' 'opencode v${version}'\n`;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function verifyCandidate(bytes, expectedHash, expectedVersion) {
  assert.ok(verification, 'Missing Docker RUN verification command');
  const root = mkdtempSync(path.join(os.tmpdir(), 'docker-backend-'));
  try {
    writeFileSync(path.join(root, 'opencode'), bytes, { mode: 0o755 });
    const result = spawnSync('sh', ['-c', verification], {
      cwd: root,
      env: { ...process.env, OPENCODE_SHA256: expectedHash, OPENCODE_VERSION: expectedVersion },
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.error, undefined);
    return { status: result.status, stderr: result.stderr, executed: existsSync(path.join(root, 'candidate-executed')) };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('Docker verification accepts matching candidate bytes and exact version', () => {
  const bytes = candidate('2.2.3-internetisalie.1');
  const result = verifyCandidate(bytes, sha256(bytes), '2.2.3-internetisalie.1');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.executed, true);
});

test('Docker verification rejects a wrong candidate hash before executing it', () => {
  const accepted = candidate('2.2.3-internetisalie.1');
  const changed = `${accepted}# changed bytes\n`;
  const result = verifyCandidate(changed, sha256(accepted), '2.2.3-internetisalie.1');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checksum did NOT match/);
  assert.equal(result.executed, false);
});

test('Docker verification rejects a wrong candidate version with a matching checksum', () => {
  const bytes = candidate('2.0.32-internetisalie.1');
  const result = verifyCandidate(bytes, sha256(bytes), '2.2.3-internetisalie.1');
  assert.notEqual(result.status, 0);
  assert.equal(result.executed, true);
});

test('Docker verification rejects a failed version probe even when its output matches', () => {
  const bytes = `${candidate('2.2.3-internetisalie.1')}exit 1\n`;
  const result = verifyCandidate(bytes, sha256(bytes), '2.2.3-internetisalie.1');
  assert.notEqual(result.status, 0);
  assert.equal(result.executed, true);
});

test('Docker verification rejects bare versions and extra version text', () => {
  for (const output of ['2.2.3-internetisalie.1', 'opencode v2.2.3-internetisalie.1 extra']) {
    const bytes = `#!/bin/sh\nprintf '%s\\n' '${output}'\n`;
    assert.notEqual(verifyCandidate(bytes, sha256(bytes), '2.2.3-internetisalie.1').status, 0);
  }
});
