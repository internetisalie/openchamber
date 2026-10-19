import { checkForUpdates } from '@openchamber/web/server/lib/package-manager.js';

// Portable fork releases have no in-place installer or electron-updater feed.
export const checkForDesktopUpdate = async () => checkForUpdates();
