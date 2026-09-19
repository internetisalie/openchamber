import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronDir = path.resolve(__dirname, '..');
const outputDir = path.join(electronDir, 'resources', 'opencode-pty-plugin');
const stagingDir = `${outputDir}-staging`;
const webOutputDir = path.resolve(electronDir, '../web/server/vendor/opencode-pty-bridge');
const webStagingDir = `${webOutputDir}-staging`;
const electronRequire = createRequire(path.join(electronDir, 'package.json'));
const pluginSource = electronRequire.resolve('@internetisalie/opencode-pty-bridge');
const bridgeRequire = createRequire(pluginSource);
const opencodePtyRequire = createRequire(bridgeRequire.resolve('@internetisalie/opencode-pty'));
const bunPtyDir = path.dirname(opencodePtyRequire.resolve('bun-pty/package.json'));
const openDir = path.dirname(opencodePtyRequire.resolve('open'));

await fs.rm(stagingDir, { recursive: true, force: true });
await fs.mkdir(stagingDir, { recursive: true });

const result = await Bun.build({
  entrypoints: [pluginSource],
  outdir: stagingDir,
  naming: 'plugin.mjs',
  target: 'bun',
  format: 'esm',
  external: ['bun-pty'],
  minify: false,
  sourcemap: 'none',
});

if (!result.success) {
  for (const message of result.logs) console.error(message);
  process.exit(1);
}

await fs.cp(bunPtyDir, path.join(stagingDir, 'node_modules', 'bun-pty'), {
  recursive: true,
  dereference: true,
});
await fs.copyFile(path.join(openDir, 'xdg-open'), path.join(stagingDir, 'xdg-open'));
await fs.chmod(path.join(stagingDir, 'xdg-open'), 0o755);
await fs.rm(webStagingDir, { recursive: true, force: true });
await fs.mkdir(webStagingDir, { recursive: true });
await fs.copyFile(path.join(stagingDir, 'plugin.mjs'), path.join(webStagingDir, 'plugin.mjs'));
await fs.copyFile(path.join(stagingDir, 'xdg-open'), path.join(webStagingDir, 'xdg-open'));
await fs.chmod(path.join(webStagingDir, 'xdg-open'), 0o755);
await fs.rm(outputDir, { recursive: true, force: true });
await fs.rename(stagingDir, outputDir);
await fs.rm(webOutputDir, { recursive: true, force: true });
await fs.rename(webStagingDir, webOutputDir);

console.log(`[electron] OpenCode PTY plugin ready: ${outputDir}`);
console.log(`[web] OpenCode PTY plugin ready: ${webOutputDir}`);
