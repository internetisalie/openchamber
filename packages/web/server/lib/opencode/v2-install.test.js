import { expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installOpenCodeV2, supportsOpenCodeV2Install } from './v2-install.js';

it('refuses before fetching or changing an existing disposable installation', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'fork-install-refusal-'));
  try {
    const binary = path.join(home, '.opencode/bin/opencode');
    await fs.mkdir(path.dirname(binary), { recursive: true });
    await fs.writeFile(binary, 'accepted-fork-bytes');
    let fetched = false;
    await expect(installOpenCodeV2({ homeDirectory: home, fetchImpl: async () => { fetched = true; throw new Error('Network used'); } })).rejects.toThrow('In-place updates are disabled');
    expect(fetched).toBe(false);
    expect(await fs.readFile(binary, 'utf8')).toBe('accepted-fork-bytes');
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});

it.each(['linux', 'darwin', 'win32'])('does not advertise installation on %s', (platform) => {
  expect(supportsOpenCodeV2Install(platform)).toBe(false);
});
