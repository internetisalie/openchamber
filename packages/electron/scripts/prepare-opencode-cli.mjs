import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBundledOpenCodeRelease } from './opencode-cli-release.mjs';
import { resolveTargetArchitecture } from './target-architecture.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(__dirname, '..');
const outputDir = path.join(electronRoot, 'resources', 'opencode-cli');
const outputMetadataPath = path.join(outputDir, 'release.json');
const cacheRoot = path.join(electronRoot, '.cache', 'opencode-cli');

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr.trim()}` : '';
    const stdout = result.stdout ? `\n${result.stdout.trim()}` : '';
    throw new Error(`Command failed: ${command} ${args.join(' ')}${stderr}${stdout}`);
  }
  return result;
};

const artifactForPlatform = (platform, targetArchitecture) => {
  const arch = targetArchitecture.opencode;
  if (platform === 'darwin') {
    if (arch === 'arm64') return { name: 'opencode-darwin-arm64.zip', binary: 'opencode' };
    if (arch === 'x64') return { name: 'opencode-darwin-x64-baseline.zip', binary: 'opencode' };
  }
  if (platform === 'win32') {
    // TEMPORARY WORKAROUND — Windows ARM64: native opencode.exe fails with a Bun
    // FFI/TinyCC dlopen error (https://github.com/anomalyco/opencode/issues/19130).
    // Bundle x64-baseline instead (runs under x64 emulation); OpenCode self-upgrade
    // is disabled elsewhere so it can't overwrite with the broken ARM64 build.
    // Remove this block and restore the original below when the upstream issue
    // is resolved.
    // --- ORIGINAL (restore when ARM64 is fixed) ---
    // if (arch === 'arm64') return { name: 'opencode-windows-arm64.zip', binary: 'opencode.exe' };
    // if (arch === 'x64') return { name: 'opencode-windows-x64-baseline.zip', binary: 'opencode.exe' };
    // --- END ORIGINAL ---
    if (arch === 'arm64') return { name: 'opencode-windows-x64-baseline.zip', binary: 'opencode.exe' };
    if (arch === 'x64') return { name: 'opencode-windows-x64-baseline.zip', binary: 'opencode.exe' };
  }
  if (platform === 'linux') {
    if (arch === 'arm64') return { name: 'opencode-linux-arm64.tar.gz', binary: 'opencode' };
    if (arch === 'x64') return { name: 'opencode-linux-x64-baseline.tar.gz', binary: 'opencode' };
  }
  throw new Error(`No OpenCode CLI artifact mapping for ${platform}/${arch}`);
};

const outputBinaryPath = (binaryName) => path.join(outputDir, binaryName);

const readBinaryVersion = (binaryPath) => {
  if (!fs.existsSync(binaryPath)) return null;
  const result = spawnSync(binaryPath, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15000,
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  return (result.stdout || '').trim().split(/\s+/)[0] || null;
};

const readPreparedRelease = () => {
  try {
    return JSON.parse(fs.readFileSync(outputMetadataPath, 'utf8'));
  } catch {
    return null;
  }
};

const ensureExecutable = (filePath) => {
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755);
  }
};

const download = async (url, destination) => {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const temp = `${destination}.tmp`;
  fs.writeFileSync(temp, Buffer.from(await response.arrayBuffer()));
  fs.renameSync(temp, destination);
};

const extractArchive = (archivePath, destination) => {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  if (archivePath.endsWith('.zip')) {
    if (process.platform === 'win32') {
      run('powershell.exe', [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath ${JSON.stringify(archivePath)} -DestinationPath ${JSON.stringify(destination)} -Force`,
      ]);
      return;
    }
    run('unzip', ['-q', archivePath, '-d', destination]);
    return;
  }
  if (archivePath.endsWith('.tar.gz')) {
    run('tar', ['-xzf', archivePath, '-C', destination]);
    return;
  }
  throw new Error(`Unsupported OpenCode CLI archive: ${archivePath}`);
};

const findBinary = (root, binaryName) => {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === binaryName.toLowerCase()) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const found = findBinary(fullPath, binaryName);
      if (found) return found;
    }
  }
  return null;
};

const main = async () => {
  const { version, repository } = resolveBundledOpenCodeRelease();

  const targetArchitecture = resolveTargetArchitecture();
  const artifact = artifactForPlatform(process.platform, targetArchitecture);
  const outputBinary = outputBinaryPath(artifact.binary);
  const existingVersion = readBinaryVersion(outputBinary);
  const preparedRelease = readPreparedRelease();
  if (
    existingVersion === version
    && preparedRelease?.version === version
    && preparedRelease?.repository === repository
  ) {
    console.log(`[electron] bundled OpenCode CLI already prepared: ${outputBinary} (${version})`);
    return;
  }

  const cacheDir = path.join(cacheRoot, repository, version, `${process.platform}-${targetArchitecture.opencode}`);
  const archivePath = path.join(cacheDir, artifact.name);
  const url = `https://github.com/${repository}/releases/download/v${version}/${artifact.name}`;
  if (!fs.existsSync(archivePath)) {
    console.log(`[electron] downloading OpenCode CLI ${version}: ${artifact.name}`);
    await download(url, archivePath);
  } else {
    console.log(`[electron] using cached OpenCode CLI archive: ${archivePath}`);
  }

  const extractDir = path.join(cacheDir, 'extract');
  extractArchive(archivePath, extractDir);
  const extractedBinary = findBinary(extractDir, artifact.binary);
  if (!extractedBinary) {
    throw new Error(`Archive ${archivePath} did not contain ${artifact.binary}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  for (const entry of fs.readdirSync(outputDir)) {
    if (entry === '.gitkeep') continue;
    fs.rmSync(path.join(outputDir, entry), { recursive: true, force: true });
  }
  fs.copyFileSync(extractedBinary, outputBinary);
  ensureExecutable(outputBinary);
  fs.writeFileSync(outputMetadataPath, `${JSON.stringify({ repository, version }, null, 2)}\n`);

  const preparedVersion = readBinaryVersion(outputBinary);
  if (preparedVersion !== version) {
    throw new Error(`Prepared OpenCode CLI version mismatch: expected ${version}, got ${preparedVersion || 'unknown'}`);
  }

  console.log(`[electron] prepared OpenCode CLI ${version}: ${outputBinary}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
