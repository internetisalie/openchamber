import { appendManagedPlugin } from '../opencode/managed-plugin-config.js';

export const createOpenCodePtyBridgeRuntime = ({ plugin }) => ({
  prepareManagedOpenCodeEnv(rawConfig) {
    return {
      OPENCODE_CONFIG_CONTENT: appendManagedPlugin(
        rawConfig,
        plugin,
        'opencode-pty bridge plugin',
      ),
    };
  },
});
