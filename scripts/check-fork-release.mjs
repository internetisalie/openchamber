import { readFileSync } from 'node:fs';

const exactVersion = '(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)';
const forkVersion = new RegExp(`^(${exactVersion})-internetisalie\\.[1-9]\\d*(-poc\\.[1-9]\\d*)?$`);

export function checkForkReleaseTag({ tag, appVersion, electronPin, dockerfile, nixTag }) {
  const release = tag.startsWith('v') && forkVersion.exec(tag.slice(1));
  if (!release || release[1] !== appVersion) {
    throw new Error(`Expected a numbered fork tag for OpenChamber ${appVersion}, got ${tag}`);
  }
  const backend = forkVersion.exec(electronPin?.version ?? '');
  if (!backend || (!release[2] && backend[2])) {
    throw new Error(`Tag ${tag} requires an exact ${release[2] ? 'numbered' : 'stable'} fork OpenCode pin`);
  }
  if (!/^[\da-f]{64}$/.test(electronPin.sha256 ?? '') || /^0+$/.test(electronPin.sha256)) {
    throw new Error('The fork OpenCode pin requires a nonzero SHA-256');
  }
  const dockerPin = /^ENV OPENCODE_VERSION=(\S+) \\\n    OPENCODE_SHA256=(\S+)$/m.exec(dockerfile);
  if (dockerPin?.[1] !== electronPin.version || dockerPin?.[2] !== electronPin.sha256) {
    throw new Error('Docker and Electron must pin the same OpenCode version and SHA-256');
  }
  if (nixTag !== `v${electronPin.version}`) {
    throw new Error('Nix and Electron must pin the same OpenCode tag');
  }
}

if (import.meta.main) {
  const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const appVersion = JSON.parse(read('packages/web/package.json')).version;
  const { opencodeCli } = JSON.parse(read('packages/electron/package.json'));
  const nixTag = JSON.parse(read('flake.lock')).nodes.opencode.original.ref;
  checkForkReleaseTag({ tag: process.argv[2] ?? '', appVersion, electronPin: opencodeCli, dockerfile: read('Dockerfile'), nixTag });
}
