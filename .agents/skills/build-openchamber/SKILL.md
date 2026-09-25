---
name: build-openchamber
description: Build and package OpenChamber web, Electron desktop, and VS Code artifacts, including native Electron modules and Linux unpacked directories.
---

# Build OpenChamber

Read the root `package.json` scripts and the target package's README before building. Use the package's declared build command as the source of truth.

For isolated container checks, set `HOME`, `TMPDIR`, `XDG_CACHE_HOME`, and `BUN_INSTALL_CACHE_DIR` to directories under the ignored workspace `.tmp/` folder. This keeps Bun and Node downloads off the host's small `/tmp` filesystem.

## Web and server

Run `bun run build:web` for the OpenChamber web assets and server. The root `bun run build` covers all workspaces and mobile assets when a full release build is needed.

## Electron

Read `packages/electron/README.md` before packaging. Run `bun run electron:build` for the default platform artifacts; it builds web assets, prepares the pinned OpenCode CLI, bundles the main process, rebuilds native modules, and invokes Electron Builder. The standard Linux target is AppImage. To get an unpacked Linux x64 directory, pass `--linux dir --x64 --publish=never` to `packages/electron/scripts/package.mjs` after the build prerequisites. `.github/workflows/linux-electron.yml` is the maintained example and runs `verify:linux-directory` afterward.

For a native module ABI failure, run `bun run --cwd packages/electron rebuild:native`, then retry the affected package build.

## VS Code

Run `bun run vscode:build`, then `bun run vscode:package` for a `.vsix`.

## Completion

Report the exact build and verification commands, target platform, and artifact path. A compile or type check alone does not establish that a packaged runtime starts.
