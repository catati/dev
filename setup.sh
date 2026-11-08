#!/usr/bin/env bash
# Catati cloud dev environment: setup script for claude.ai/code.
# Runs as root on Ubuntu 24.04 before Claude starts. Environment variables are not set yet.
# A non-zero exit fails session start, so keep every step idempotent.
#
# Scope: runtimes and root-only OS libraries. Repo tools belong in each repo (see README "Repo contract").
set -euo pipefail

# --- Node ----------------------------------------------------------------------
# All Node repos need Node 24; agents workspace packages need >= 24.15.
# The session PATH puts the image's /opt/node22/bin before /usr/local/bin, and setup cannot change
# that PATH. So n installs Node 24 into /opt/node22, the first prefix the session finds.
NODE_PREFIX=/opt/node22
export PATH="$NODE_PREFIX/bin:$PATH"

npm install -g n
N_PREFIX="$NODE_PREFIX" n 24
hash -r
# shellcheck disable=SC2016 # ${...} is a JavaScript template literal, not shell expansion
node -e 'const [a, b] = process.versions.node.split(".").map(Number);
  if (a < 24 || (a === 24 && b < 15)) { console.error(`node ${process.version} < 24.15`); process.exit(1); }
  console.log(`node ${process.version} at ${process.execPath}`);'

# Each repo's packageManager field picks its pnpm version; corepack fetches it on first use.
corepack enable

# Python: uv is in the image and fetches the version each repo's requires-python asks for.
uv --version # fail setup loudly if the image stops shipping uv

# --- Playwright system libraries -------------------------------------------------
# apt packages need root. Repos download their own pinned browser builds on install.
# Keep this version at or above the highest @playwright/test pin across the repos.
npx -y playwright@1.63.0 install-deps chromium

echo "catati cloud setup: done"
