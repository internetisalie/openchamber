import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkForkReleaseTag } from './check-fork-release.mjs';

const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
const electron = JSON.parse(readFileSync(new URL('../packages/electron/package.json', import.meta.url), 'utf8'));
const nixTag = JSON.parse(readFileSync(new URL('../flake.lock', import.meta.url), 'utf8')).nodes.opencode.original.ref;
const pin = /^ENV OPENCODE_VERSION=(\S+) \\\n    OPENCODE_SHA256=(\S+)$/m.exec(dockerfile);
const verificationStage = dockerfile.split('FROM opencode-pin AS opencode-verified\n')[1]?.split('\nFROM ')[0];
const verification = /^RUN ([\s\S]+)$/m.exec(verificationStage ?? '')?.[1].replace(/\\\n\s*/g, ' ');

test('Docker uses one concrete numbered fork version and SHA-256 matching Electron', () => {
  assert.ok(pin, 'Missing authoritative Docker backend pin');
  assert.match(pin[1], /^\d+\.\d+\.\d+-internetisalie\.[1-9]\d*(?:-poc\.[1-9]\d*)?$/);
  assert.match(pin[2], /^[a-f0-9]{64}$/);
  assert.notEqual(pin[2], '0'.repeat(64));
  assert.equal(pin[1], electron.opencodeCli.version);
  assert.equal(pin[2], electron.opencodeCli.sha256);
  assert.equal((dockerfile.match(/^ENV OPENCODE_VERSION=/gm) ?? []).length, 1);
  assert.equal((dockerfile.match(/^\s*OPENCODE_SHA256=/gm) ?? []).length, 1);
  assert.doesNotMatch(dockerfile, /^ARG OPENCODE_(?:VERSION|SHA256)(?:=|\s|$)/m);
});

// The stages BuildKit builds for a target: the target, the stage each of them
// starts FROM, and each stage a COPY --from names. Build args resolve to their
// global defaults. An unnamed target is the last stage, which is the default.
function stagesBuiltFor(source, target) {
  const defaults = new Map([...source.matchAll(/^ARG (\w+)=(\S*)$/gm)].map((match) => [match[1], match[2]]));
  const stages = new Map();
  let current = null;
  for (const line of source.replace(/\\\n\s*/g, ' ').split('\n')) {
    const from = /^FROM (?:--\S+ )*(\S+)(?: AS (\S+))?\s*$/.exec(line);
    if (from) {
      const base = from[1].replace(/^\$\{(\w+)\}$/, (_, name) => defaults.get(name) ?? from[1]);
      current = { name: from[2], needs: new Set([base]) };
      stages.set(from[2] ?? `#${stages.size}`, current);
      continue;
    }
    const copied = current && /^COPY (?:--\S+ )*--from=(\S+) /.exec(line);
    if (copied) current.needs.add(copied[1]);
  }
  const built = new Set();
  const visit = (name) => {
    if (built.has(name) || !stages.has(name)) return;
    built.add(name);
    for (const need of stages.get(name).needs) visit(need);
  };
  visit(target ?? [...stages.keys()].at(-1));
  return built;
}

test('the default build target is external and builds no OpenCode backend stage', () => {
  assert.equal([...stagesBuiltFor(dockerfile)].at(0), 'external');
  const external = stagesBuiltFor(dockerfile);
  for (const stage of ['opencode-pin', 'opencode-release', 'opencode-artifact', 'opencode-verified', 'bundled']) {
    assert.ok(!external.has(stage), `${stage} is built by the default target`);
  }
  assert.ok(stagesBuiltFor(dockerfile, 'bundled').has('opencode-verified'));
  assert.ok(stagesBuiltFor(dockerfile, 'bundled').has('opencode-release'));
});

test('only the bundled target copies the verified CLI, and the release stage is the default source', () => {
  assert.match(dockerfile, /^ARG OPENCODE_SOURCE=opencode-release$/m);
  assert.match(dockerfile, /^FROM opencode-pin AS opencode-release\nADD --checksum=sha256:\$\{OPENCODE_SHA256\} --chmod=755 https:\/\/github\.com\/internetisalie\/opencode\/releases\/download\/v\$\{OPENCODE_VERSION\}\/opencode-linux-x64-baseline \/opencode$/m);
  assert.match(dockerfile, /^FROM \$\{OPENCODE_SOURCE\} AS opencode-artifact$/m);
  assert.match(verificationStage ?? '', /^COPY --from=opencode-artifact --chmod=755 \/opencode \.\/opencode$/m);
  assert.match(dockerfile, /^COPY --from=opencode-verified --chmod=755 \/backend\/opencode \/usr\/local\/bin\/opencode$/m);
  const runtime = dockerfile.split(' AS runtime\n')[1];
  assert.ok(runtime);
  const [shared, targets] = runtime.split('FROM runtime AS bundled\n');
  assert.doesNotMatch(shared, /^ADD |^COPY --from=opencode-/gm);
  assert.match(targets, /^COPY --from=opencode-verified /);
  assert.match(targets, /^FROM runtime AS external\nENV OPENCODE_SKIP_START=true\s*$/m);
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

test('numbered candidate image tags accept the checked-in backend pin', () => {
  assert.doesNotThrow(() => checkForkReleaseTag('v2.7.2-internetisalie.1-poc.2', '2.7.2', electron.opencodeCli, dockerfile, nixTag));
});

test('production tags reject PoC and dev pins even when both packages agree', () => {
  const stableTag = 'v2.7.2-internetisalie.1';
  const candidateTag = 'v2.7.2-internetisalie.1-poc.2';
  const poc = { ...electron.opencodeCli, version: '2.3.2-internetisalie.42-poc.1' };
  const pocDockerfile = dockerfile.replace(pin[1], poc.version);
  assert.doesNotThrow(() => checkForkReleaseTag(candidateTag, '2.7.2', poc, pocDockerfile, `v${poc.version}`));
  assert.throws(() => checkForkReleaseTag(stableTag, '2.7.2', poc, pocDockerfile, `v${poc.version}`), /exact stable/);
  const dev = { ...electron.opencodeCli, version: '2.3.2-internetisalie.dev' };
  const devDockerfile = dockerfile.replace(pin[1], dev.version);
  assert.throws(() => checkForkReleaseTag(stableTag, '2.7.2', dev, devDockerfile, `v${dev.version}`), /exact stable/);
  assert.throws(() => checkForkReleaseTag(candidateTag, '2.7.2', dev, devDockerfile, `v${dev.version}`), /exact numbered/);
});

test('production tag requires an exact stable fork pin and matching nonzero checksum', () => {
  // Fixture metadata only. The Linux release job separately verifies the downloaded artifact.
  const fixture = { version: '2.3.2-internetisalie.42', sha256: sha256('release policy fixture') };
  const fixtureDockerfile = dockerfile.replace(pin[1], fixture.version).replace(pin[2], fixture.sha256);
  const check = (overrides, docker = fixtureDockerfile, tag = 'v2.3.2-internetisalie.42') =>
    checkForkReleaseTag('v2.7.2-internetisalie.1', '2.7.2', { ...fixture, ...overrides }, docker, tag);
  assert.doesNotThrow(() => check({}));
  assert.throws(() => check({ sha256: undefined }), /requires a nonzero SHA-256/);
  assert.throws(() => check({ sha256: '0'.repeat(64) }), /requires a nonzero SHA-256/);
  assert.throws(() => check({}, fixtureDockerfile.replace(fixture.sha256, sha256('different'))), /same OpenCode version and SHA-256/);
  assert.throws(() => check({}, fixtureDockerfile.replace(fixture.version, '2.3.2-internetisalie.43')), /same OpenCode version and SHA-256/);
  assert.throws(() => check({}, fixtureDockerfile, 'v2.3.2-internetisalie.42-poc.1'), /same OpenCode tag/);
  assert.throws(() => checkForkReleaseTag('v2.7.3-internetisalie.1', '2.7.2', fixture, fixtureDockerfile, 'v2.3.2-internetisalie.42'), /Expected a numbered fork tag/);
});
