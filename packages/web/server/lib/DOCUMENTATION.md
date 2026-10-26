# Fork release policy

## Ownership

`fork-updates.js` owns the fixed `internetisalie/openchamber` and
`internetisalie/opencode` release repositories, numbered fork version validation,
and revision ordering. `package-manager.js` reads the installed OpenChamber
release identity and provides read-only checks. HTTP, CLI, Electron and VS Code
own their refusal responses. Shared UI owns presentation and rejects upstream
metadata from older remote servers.

## Invariants

- Every release check uses the fixed GitHub API repository with redirects refused.
  Environment overrides, npm registries and upstream update services cannot
  select a replacement source. Checks transmit no usage payload or install ID.
- Only regular, published, numbered `<version>-internetisalie.<revision>` releases
  are accepted. Unknown installed identities, including historical hash versions,
  have unknown ordering. Failed metadata reads stay failures and never fall back.
- `packages/web/package.json` records `forkRelease` separately from the upstream
  package version. Linux release and image builds derive it from the numbered
  release tag, validate its pattern and upstream version, and stamp it before
  building. Non-release builds use `<version>-internetisalie.dev`. Packed web
  metadata and CLI version checks must match the derived release identity. The
  CLI version and server status report it; Electron SSH matching uses the same value.
- OpenChamber install requests return HTTP 409 `FORK_MANUAL_UPDATE_REQUIRED`
  before filesystem changes, installer processes or server shutdown. CLI update
  returns a nonzero status, including JSON and quiet modes.
- OpenCode install and upgrade requests also refuse at the HTTP and executor
  boundaries. Managed OpenCode children receive `OPENCODE_DISABLE_AUTOUPDATE=1`
  after user environment overlays. External servers remain operator-managed.
- The UI offers fork release links and manual replacement. It never sends an
  update-install request to an older remote server. Electron does not initialize
  electron-updater or hand a cached payload to an installer. A plain app restart
  remains available.
- SSH managed connections can use an already-installed matching fork identity.
  Missing or mismatched installations fail before daemon adoption or shutdown.
  SSH never installs packages. Remote-host update requests fail locally.
- `scripts/install.sh` refuses before package-manager discovery, downloads or
  filesystem changes. It cannot overwrite this fork with the upstream npm package.

## Decisions

### Why replacement is operator-managed

The supported fork artifacts are portable Linux x64 archives and container
images. Their accepted installation model has no verified in-place replacement
and rollback implementation. The maintainer chose refusal over adding an
installer. Manual replacement must use the fork's published artifact identity
and checksum evidence. No automatic replacement claims checksum verification.

### Why the upstream updater is removed

A confirmation prompt or a fork version label does not establish artifact
ownership. Upstream package-manager commands and remote update POSTs can replace
fork behavior even after a user approves the operation.

## Validation boundaries

Focused tests cover release-source selection, revision ordering, failed checks,
direct HTTP refusal, CLI JSON failure, disposable-installation preservation,
native capability refusal, and SSH command non-execution. A packaged desktop
rejection check must also prove that the app and its backend remain running.
Successful replacement and rollback are outside this policy because no installer
is enabled. Standalone OpenCode's own updater belongs to its separate repository;
the child environment gate is not proof that its explicit `upgrade` command is
fork-safe. Previously published binaries retain their previous behavior.
