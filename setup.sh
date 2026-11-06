#!/usr/bin/env bash
# Catati cloud dev environment: setup script for claude.ai/code.
# Runs as root on Ubuntu 24.04 before Claude starts. Environment variables are not set yet.
# A non-zero exit fails session start, so keep every step idempotent.
#
# Scope: runtimes and root-only OS libraries. Repo tools belong in each repo (see README "Repo contract").
set -euo pipefail

# --- Node ----------------------------------------------------------------------
# All Node repos need Node 24; agents workspace packages need >= 24.15. The image default is 22.
NODE_MAJOR=24

# shortcut: installs through nvm when the image has it, else through n.
# Confirm `node -v` prints v24.15 or later in the first session; pin the image's own method if not.
if [ -s "${NVM_DIR:-/root/.nvm}/nvm.sh" ]; then
  set +u # nvm.sh reads unset variables
  # shellcheck disable=SC1091
  . "${NVM_DIR:-/root/.nvm}/nvm.sh"
  nvm install "$NODE_MAJOR"
  nvm alias default "$NODE_MAJOR"
  set -u
else
  npm install -g n
  n "$NODE_MAJOR"
fi
hash -r
# shellcheck disable=SC2016 # ${...} is a JavaScript template literal, not shell expansion
node -e 'const [a, b] = process.versions.node.split(".").map(Number);
  if (a < 24 || (a === 24 && b < 15)) console.warn(`WARNING: node ${process.version} < 24.15; agents needs 24.15+`);
  else console.log(`node ${process.version}`);'

# Each repo's packageManager field picks its pnpm version; corepack fetches it on first use.
corepack enable

# Python: uv is in the image and fetches the version each repo's requires-python asks for.

# --- Playwright system libraries -------------------------------------------------
# apt packages need root. Repos download their own pinned browser builds on install.
npx -y playwright@1.63.0 install-deps chromium

echo "catati cloud setup: done"
