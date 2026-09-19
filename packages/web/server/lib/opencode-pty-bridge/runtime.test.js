import { describe, expect, it } from 'vitest';

import { createOpenCodePtyBridgeRuntime } from './runtime.js';

describe('OpenCode PTY bridge runtime', () => {
  it('appends the packaged bridge to managed OpenCode config', () => {
    const runtime = createOpenCodePtyBridgeRuntime({ plugin: '@internetisalie/opencode-pty-bridge@0.1.0' });
    const env = runtime.prepareManagedOpenCodeEnv('{"plugin":["file:///existing.js"]}');
    const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT);

    expect(config.plugin).toEqual([
      'file:///existing.js',
      '@internetisalie/opencode-pty-bridge@0.1.0',
    ]);
    expect(Object.keys(env)).toEqual(['OPENCODE_CONFIG_CONTENT']);
  });
});
