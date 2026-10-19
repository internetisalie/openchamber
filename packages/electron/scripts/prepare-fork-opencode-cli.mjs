import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseOpenCodeCliVersion } from './opencode-cli-version.mjs';

// The fork publishes the accepted Linux glibc binary as a GitHub release asset.
// Its source-pinned hash also applies to cached and already-staged copies.
export const prepareForkOpenCodeCli = async ({ version, sha256, platform, architecture, outputBinary, cacheRoot }) => {
  if (!/^\d+\.\d+\.\d+-internetisalie\.[0-9A-Za-z.]+$/.test(version)) {
    throw new Error(`Invalid fork OpenCode version: ${version}`);
  }
  if (platform !== 'linux' || architecture !== 'x64') {
    throw new Error(`Fork OpenCode is released only for linux/x64, got ${platform}/${architecture}`);
  }
  if (!/^[a-f0-9]{64}$/.test(sha256 ?? '')) {
    throw new Error('Fork OpenCode requires a pinned SHA-256.');
  }
  const matchesHash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex') === sha256;
  const verify = (file) => {
    if (!matchesHash(file)) throw new Error(`Fork OpenCode SHA-256 mismatch: ${file}`);
    const result = spawnSync(file, ['--version'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
    if (result.status !== 0 || parseOpenCodeCliVersion(result.stdout) !== version) {
      throw new Error(`Fork OpenCode version mismatch: expected ${version}`);
    }
  };
  if (fs.existsSync(outputBinary) && matchesHash(outputBinary)) {
    verify(outputBinary);
    return;
  }
  const cachePath = path.join(cacheRoot, version, 'linux-x64', 'opencode');
  if (!fs.existsSync(cachePath)) {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const url = `https://github.com/internetisalie/opencode/releases/download/v${version}/opencode-linux-x64-baseline`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download fork OpenCode: HTTP ${response.status}`);
    const temporary = `${cachePath}.tmp`;
    try {
      fs.writeFileSync(temporary, Buffer.from(await response.arrayBuffer()), { mode: 0o755 });
      verify(temporary);
      fs.renameSync(temporary, cachePath);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  verify(cachePath);
  fs.mkdirSync(path.dirname(outputBinary), { recursive: true });
  const temporary = `${outputBinary}.tmp`;
  try {
    fs.copyFileSync(cachePath, temporary);
    fs.chmodSync(temporary, 0o755);
    fs.renameSync(temporary, outputBinary);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  console.log(`[electron] prepared pinned fork OpenCode ${version}: ${outputBinary}`);
};
