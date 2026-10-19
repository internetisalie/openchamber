import type { ForkRelease } from './fork-updates.js';
export function getCurrentVersion(): string;
export function checkForUpdates(): Promise<Partial<ForkRelease> & { available: boolean | null; currentVersion: string; disabled?: boolean }>;
export function getUpdateCommand(): never;
export function executeUpdate(): { success: false; exitCode: 1; error: string };
