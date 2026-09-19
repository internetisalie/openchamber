export const DEFAULT_OPENCODE_CLI_VERSION = '1.18.31-internetisalie.2';
export const DEFAULT_OPENCODE_CLI_REPOSITORY = 'internetisalie/opencode';

export const resolveBundledOpenCodeRelease = (environment = process.env) => {
  const version = environment.OPENCHAMBER_OPENCODE_CLI_VERSION || DEFAULT_OPENCODE_CLI_VERSION;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid OpenCode CLI version: ${version}`);
  }

  const repository = environment.OPENCHAMBER_OPENCODE_CLI_REPOSITORY || DEFAULT_OPENCODE_CLI_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`Invalid OpenCode CLI repository: ${repository}`);
  }

  return { version, repository };
};
