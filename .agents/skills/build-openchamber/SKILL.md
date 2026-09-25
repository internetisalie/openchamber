---
name: build-openchamber
description: Build or package OpenChamber Web, Electron desktop, or VS Code artifacts, including native addon rebuilds and release smoke checks.
---

# Build OpenChamber

Read the scripts in the root and target package `package.json` before choosing a command. For desktop packaging, also read `packages/electron/README.md`. Use the target package's checks and build path; a workspace-wide check is needed when the change crosses package contracts.

## Targets

| Artifact | Command from the repository root | Check |
|---|---|---|
| Web assets | `bun run build:web` | Build and load the resulting assets in an isolated web run. |
| Electron package | `bun run electron:build --<platform>` | Verify packaged startup and the staged OpenCode CLI. Use a native host for Linux x64 or arm64. |
| VS Code extension | `bun run vscode:build`, then `bun run vscode:package` | Smoke-test the packaged `.vsix` in a disposable VS Code profile when behavior changed. |

The Electron `package` script stages web assets and the pinned OpenCode CLI, bundles the main process, rebuilds native addons for Electron, then invokes `electron-builder`. `bun run build:electron` is an empty workspace build step, not a packaged application. For an addon ABI failure, use `bun run --cwd packages/electron rebuild:native`, then package again.

Keep packaging checks matched to the changed runtime. For desktop startup or updater changes, use the focused tests and packaged run described in `packages/electron/README.md` and `desktop-shell`. For release artifacts, use the repository's release smoke scripts after the package exists. Report the artifact path, target architecture, commands run, and any runtime checks that could not be completed.
