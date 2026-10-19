import assert from 'node:assert/strict';
import test from 'node:test';
import { requestRemoteHostUpdate } from './remote-host-update.mjs';

test('refuses without sending an install request to an older or unverified server', async () => {
  const result = await requestRemoteHostUpdate({ url: 'https://server.invalid', chromiumFetch: () => assert.fail('Remote install request sent') });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /In-place updates are disabled/);
});
