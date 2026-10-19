import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('the curl installer refuses before package managers or files are touched', () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'fork-installer-refusal-'));
  try {
    const marker = path.join(home, 'installer-ran');
    for (const command of ['bun', 'npm', 'pnpm', 'yarn', 'curl', 'wget']) {
      writeFileSync(path.join(home, command), `#!/bin/sh\nprintf touched > '${marker}'\nexit 0\n`, { mode: 0o755 });
    }
    const result = spawnSync('/bin/bash', [fileURLToPath(new URL('./install.sh', import.meta.url))], {
      cwd: home, env: { HOME: home, PATH: `${home}:/usr/bin:/bin` }, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /FORK_MANUAL_UPDATE_REQUIRED/);
    assert.match(result.stderr, /https:\/\/github.com\/internetisalie\/openchamber\/releases/);
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
