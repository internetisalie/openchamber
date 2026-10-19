import { mkdtemp, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { runOpenCodeCliUpgrade } from './cli-upgrade.js';

it('refuses before starting the selected executable', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'fork-upgrade-refusal-'));
  try {
    const script = path.join(directory, 'cli.cjs');
    const marker = path.join(directory, 'ran');
    await writeFile(script, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started');`);
    await expect(runOpenCodeCliUpgrade({ binary: process.execPath, args: [script] })).rejects.toThrow('In-place updates are disabled');
    await expect(access(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
