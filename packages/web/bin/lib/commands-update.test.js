import { afterEach, expect, it, vi } from 'vitest';
import { createUpdateCommand } from './commands-update.js';

afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });

it.each([{}, { quiet: true }])('refuses before importing installers or discovering instances', async (options) => {
  const touched = vi.fn(() => { throw new Error('Touched runtime'); });
  await expect(createUpdateCommand({ importFromFilePath: touched, serveCommand: touched })(options)).rejects.toThrow('In-place updates are disabled');
  expect(touched).not.toHaveBeenCalled();
});

it('returns a JSON refusal with a failing exit status', async () => {
  const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  await createUpdateCommand()({ json: true });
  expect(process.exitCode).toBe(1);
  expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ status: 'error', success: false, code: 'FORK_MANUAL_UPDATE_REQUIRED' });
});
