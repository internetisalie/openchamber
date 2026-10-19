#!/usr/bin/env bash
# This fork has no automatic replacement installer.
set -euo pipefail

echo 'FORK_MANUAL_UPDATE_REQUIRED: Automatic installation is disabled for this fork.' >&2
echo 'Replace the installation using a verified release from https://github.com/internetisalie/openchamber/releases' >&2
exit 1
