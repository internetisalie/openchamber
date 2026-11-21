# Nix builds

Run the server with `nix run .#openchamber` or build the desktop with `nix build .#openchamber-desktop`.

Server and desktop outputs support `x86_64-linux`, `aarch64-linux` and `aarch64-darwin`. On macOS, the desktop output contains `Applications/OpenChamber.app`; `nix run .#gui` starts its executable. The Nix app is ad-hoc signed, not notarized.

Bun dependencies come from `bun.lock`. The pinned bun2nix converter runs in a Nix derivation, and `fetchBunDeps` fetches each package using its lockfile integrity hash. The dependency installation runs offline with lifecycle scripts disabled. Dependency patches listed in `package.json` are applied when building the cache.

The generated dependency expression stays in the Nix store. Changing `bun.lock` requires no generated file or aggregate dependency hash update. Evaluation requires import-from-derivation and may build the converter before returning a result.

Nix builds OpenCode from the fork tag locked in `flake.lock` with the fork server's headless build flag. OpenChamber supplies the browser UI. The version must match the Electron backend pin, and the desktop build verifies the staged launcher reports that exact version. The Nix backend has platform-specific dependency hashes in `flake.nix`. These hashes cover the Bun dependency tree; Docker and Electron separately verify the SHA-256 of the prebuilt GNU release asset.

When changing `opencodeCli.version` in `packages/electron/package.json`, update the matching OpenCode tag in `flake.nix`, run `nix flake update opencode`, and verify the dependency hashes on the native CI matrix.

Validate changes with `nix build .#openchamber .#openchamber-desktop` and `nix run .#openchamber -- --version`. Desktop launch requires a graphical session.

The `nix-eval` workflow evaluates and builds both packages on native runners for all 3 systems. Evaluation may build the bun2nix converter through import-from-derivation, including with `nix flake check --no-build`.
