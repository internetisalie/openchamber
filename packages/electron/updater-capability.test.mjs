import assert from 'node:assert/strict';
import test from 'node:test';
import { assertUpdaterCapability } from './updater-capability.mjs';

for (const platform of ['linux', 'darwin', 'win32']) {
  for (const packageType of ['', 'deb', 'rpm', 'AppImage']) {
    test(`refuses ${platform} ${packageType || 'portable'} replacement before filesystem access`, () => {
      assert.throws(() => assertUpdaterCapability({ platform, packageType, packaged: true,
        appImagePath: '/fake/app.AppImage', stat: () => assert.fail('Filesystem read'), access: () => assert.fail('Filesystem read'),
      }), /In-place updates are disabled/);
    });
  }
}
