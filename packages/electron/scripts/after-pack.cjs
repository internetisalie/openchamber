const fs = require('node:fs');
const path = require('node:path');

module.exports = (context) => {
  const resourcesPath = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  const pluginModulesSource = path.join(__dirname, '..', 'resources', 'opencode-pty-plugin', 'node_modules');
  if (!fs.existsSync(pluginModulesSource)) {
    throw new Error(`Missing staged OpenCode PTY plugin dependencies at ${pluginModulesSource}`);
  }
  fs.cpSync(
    pluginModulesSource,
    path.join(resourcesPath, 'opencode-pty-plugin', 'node_modules'),
    { recursive: true },
  );

  if (context.electronPlatformName !== 'darwin') return;

  const sourceAssetsPath = path.join(__dirname, '..', 'resources', 'icons', 'Assets.car');

  if (!fs.existsSync(sourceAssetsPath)) {
    throw new Error(`Missing compiled app icon asset catalog at ${sourceAssetsPath}`);
  }

  fs.copyFileSync(sourceAssetsPath, path.join(resourcesPath, 'Assets.car'));
};
