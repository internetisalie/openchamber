---
name: build-openchamber
description: 'Use when building, packaging, or compiling OpenChamber. Covers desktop app building for Linux (e.g. bun run electron:build --linux), macOS, or Windows, rebuilding native Node modules (like node-pty or bun-pty), and packaging the VS Code extension.'
license: MIT
compatibility: opencode
---

## Overview

OpenChamber is a monorepo built using Bun and Node.js (>=22). It can be packaged for multiple targets: the Electron desktop application, the VS Code extension, and the standalone Web App/Server.

**Core principle:** Always run dependency installations and workspace-wide build/lint verification steps before attempting production-ready builds.

## When to Use

- Building the production Electron desktop application for Linux, Windows, or macOS.
- Rebuilding native Node.js addons (e.g., `node-pty`, `bun-pty`) for the Electron ABI.
- Compiling and packaging the VS Code extension webviews and host code.
- Performing dry-run or release smoke tests on build packages.

## Prerequisites

- **Bun**: Package manager and primary task runner.
- **Node.js**: Runtime version >=22.0.0.
- **Desktop Prerequisites**:
  - `macOS`: Xcode and build tools (required for notarization/app bundle packaging).
  - `Windows`: NSIS installer framework (required for packaging the installer executable).
  - `Linux`: Standard C/C++ build tools and GTK development libraries.

## Command Reference

| Action | Command | Scope |
|--------|---------|-------|
| **Build Web assets & UI** | `bun run build` | Workspace-wide |
| **Electron Dev Launch** | `bun run electron:dev` | Desktop dev (with Vite HMR) |
| **Electron Package (Linux)** | `bun run electron:build --linux` | Package Electron for Linux |
| **Electron Package (Windows)** | `bun run electron:build --win` | Package Electron NSIS for Windows |
| **Electron Package (macOS)** | `bun run electron:build --mac` | Package Electron DMG for macOS |
| **VS Code Build** | `bun run vscode:build` | Build VS Code extension and webview |
| **VS Code Package** | `bun run vscode:package` | Package VS Code extension (`.vsix`) |
| **Rebuild Native Addons** | `bun run --cwd packages/electron rebuild:native` | Compile binary dependencies for Electron ABI |

## Step-by-Step Workflows

### 1. Packaging Electron Desktop for Linux

The command `bun run electron:build --linux` executes a multi-step pipeline configured in `packages/electron/package.json`:

1. **build:web-assets**: Compiles the `@openchamber/web` frontend code and exports the static assets into `packages/electron/resources/web-dist`.
2. **bundle:main**: Bundles the Electron main process files (`main.mjs`, `ssh-manager.mjs`, `tray.mjs`, `opencode-cwd.mjs`) into a unified script at `dist-bundle/main.mjs`.
3. **rebuild:native**: Rebuilds the underlying native packages (such as `node-pty` / `bun-pty`) matching the target Electron ABI version.
4. **package.mjs**: Launches `electron-builder` with the `--linux` argument (passing process CLI arguments directly).

Output files (AppImage, zip, or directory targets) are generated under `packages/electron/dist/`.

### 2. Packaging Electron Desktop for Windows & macOS

- **Windows**: `bun run electron:build --win`
  - Packages the desktop app into an NSIS installer.
  - If code signing credentials (`CSC_LINK` / `WINDOWS_CSC_LINK`) are missing from the environment, the build automatically falls back to packaging an unsigned installer.
- **macOS**: `bun run electron:build --mac`
  - Packages the desktop app into a DMG and zip file.
  - Signing and notarization require Apple Developer credentials configured in the environment.

### 3. Packaging the VS Code Extension

1. Build both webview interfaces and host extensions:
   ```bash
   bun run vscode:build
   ```
2. Compile and package the extension into a `.vsix` file:
   ```bash
   bun run vscode:package
   ```

## Troubleshooting Native Modules

If the desktop application fails to boot or throws errors like `Module did not self-register` or errors referencing native dependencies (e.g., `node-pty`), rebuild them explicitly against the current Electron ABI:

```bash
bun run --cwd packages/electron rebuild:native
```

Ensure the target headers match the Electron version declared in `packages/electron/package.json`.

## Verification Checklist

Before releasing or submitting pull requests, run these checks to ensure consistency across the workspace:

- [ ] Clean build artifacts: `bun run clean`
- [ ] Run typescript diagnostics: `bun run type-check`
- [ ] Check code style and standards: `bun run lint`
- [ ] Run release smoke script: `bun run release:test`

## Key Files

- Root script executor: `package.json`
- Desktop configuration: `packages/electron/package.json`
- Packaging orchestrator: `packages/electron/scripts/package.mjs`
- Web asset builder: `packages/electron/scripts/build-web-assets.mjs`
- Native compilation: `packages/electron/scripts/rebuild-native.mjs`
