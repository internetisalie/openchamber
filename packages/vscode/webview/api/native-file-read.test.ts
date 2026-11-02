import { expect, test } from 'bun:test';

test('native remote read is explicitly unsupported without using the local file bridge', async () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const acquireDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'acquireVsCodeApi');
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
    Object.defineProperty(globalThis, 'acquireVsCodeApi', { configurable: true, value: () => {
      throw new Error('Unexpected local bridge acquisition');
    } });
    const { createVSCodeFilesAPI } = await import('./files');
    const files = createVSCodeFilesAPI();
    if (!files.readNativeFile) throw new Error('Explicit unsupported operation missing');
    expect(await files.readNativeFile('.supervisor/manifest.json', { directory: '/work/container' }))
      .toEqual({ status: 'unsupported' });
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    else Reflect.deleteProperty(globalThis, 'window');
    if (acquireDescriptor) Object.defineProperty(globalThis, 'acquireVsCodeApi', acquireDescriptor);
    else Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
  }
});
