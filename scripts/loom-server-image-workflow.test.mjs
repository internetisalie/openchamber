import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

const workflowPath = fileURLToPath(new URL('../.github/workflows/loom-server-image.yml', import.meta.url));
const workflow = yaml.parse(fs.readFileSync(workflowPath, 'utf8'));
const steps = workflow.jobs.image.steps;
const stepName = 'Refuse a re-push of a release tag';
const index = steps.findIndex((s) => s.name === stepName);
const step = steps[index];

// Runs the step's script as the runner does (bash -e) with a fake `docker` that
// stands in for the registry: it prints `stderr` and exits with `status`.
function run({ refType = 'tag', refName = 'v2.7.2-internetisalie.1', status, stderr = '' }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repush-'));
  try {
    const docker = path.join(dir, 'docker');
    fs.writeFileSync(
      docker,
      `#!/bin/sh\necho "$@" >> "${dir}/calls"\nprintf '%s' "$FAKE_STDERR" >&2\nexit ${status}\n`,
      { mode: 0o755 },
    );
    const result = spawnSync('bash', ['-e', '-c', step.run], {
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        GITHUB_REF_TYPE: refType,
        GITHUB_REF_NAME: refName,
        FAKE_STDERR: stderr,
      },
      encoding: 'utf8',
    });
    const calls = fs.existsSync(path.join(dir, 'calls'))
      ? fs.readFileSync(path.join(dir, 'calls'), 'utf8').trim().split('\n')
      : [];
    return { ...result, calls };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('the refusal step sits between the GHCR login and the publish step, gated off pull requests', () => {
  assert.equal(steps[index - 1].name, 'Login to GHCR');
  assert.equal(steps[index + 1].name, 'Build and publish');
  assert.equal(step.if, "github.event_name != 'pull_request'");
});

test('a release tag the registry serves is refused', () => {
  const r = run({ status: 0 });
  assert.equal(r.status, 1);
  assert.match(
    r.stdout,
    /::error::ghcr\.io\/internetisalie\/openchamber:v2\.7\.2-internetisalie\.1 is already published; publish a new release version/,
  );
  assert.deepEqual(r.calls, ['buildx imagetools inspect ghcr.io/internetisalie/openchamber:v2.7.2-internetisalie.1']);
});

test('a release tag the registry reports as not found continues', () => {
  const r = run({ status: 1, stderr: 'ghcr.io/internetisalie/openchamber:v2.7.2-internetisalie.1: not found' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /is not published; continuing/);
});

test('a registry that cannot answer fails the job and prints its stderr', () => {
  const r = run({ status: 1, stderr: 'dial tcp: i/o timeout' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /dial tcp: i\/o timeout/);
});

test('a tag that is not a release is not checked', () => {
  for (const refName of ['v2.7.2-internetisalie.1-poc.7', 'v2.7.2-internetisalie.0', 'loom-image-1']) {
    const r = run({ refName, status: 0 });
    assert.equal(r.status, 0, refName);
    assert.deepEqual(r.calls, [], refName);
  }
  const branch = run({ refType: 'branch', refName: 'v2-fork-trunk', status: 0 });
  assert.equal(branch.status, 0);
  assert.deepEqual(branch.calls, []);
});
