export const canReadWorkspaceComposition = (source: string, activeSource: string, directory: string, sessionDirectory: string | undefined) =>
  source === activeSource && directory === sessionDirectory;
