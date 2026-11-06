#!/usr/bin/env bash
# Catati cloud dev environment: setup script for claude.ai/code.
# Runs as root on Ubuntu 24.04 before Claude starts. Environment variables are not set yet.
# A non-zero exit fails session start, so keep every step idempotent.
set -euo pipefail

NODE_MAJOR=24 # catati-app, catati-cat-hotel and agents need Node >= 24; the image default is 22.

# shortcut: installs through nvm when the image has it, else through n.
# Confirm `node -v` prints v24 in the first session; pin the image's own method if not.
if [ -s "${NVM_DIR:-/root/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-/root/.nvm}/nvm.sh"
  nvm install "$NODE_MAJOR"
  nvm alias default "$NODE_MAJOR"
else
  npm install -g n
  n "$NODE_MAJOR"
fi
hash -r
node -v

# pnpm versions pinned by each repo's packageManager field.
corepack enable
corepack prepare pnpm@10.30.3 --activate # catati-app, catati-cat-hotel
corepack prepare pnpm@10.4.1             # agents

# agents targets Python 3.13 (pyproject.toml).
uv python install 3.13

echo "catati cloud setup: done"
