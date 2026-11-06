#!/usr/bin/env bash
# Catati cloud dev environment: setup script for claude.ai/code.
# Runs as root on Ubuntu 24.04 before Claude starts. Environment variables are not set yet.
# A non-zero exit fails session start, so keep every step idempotent.
set -euo pipefail

# --- System packages ---------------------------------------------------------
# jq: catsper's Claude hooks and catati-horizon's scripts/check-theme.sh.
apt-get update -qq
apt-get install -y -qq jq

# --- Node ----------------------------------------------------------------------
# All Node repos need Node 24; agents workspace packages need >= 24.15. The image default is 22.
NODE_MAJOR=24

# shortcut: installs through nvm when the image has it, else through n.
# Confirm `node -v` prints v24.15 or later in the first session; pin the image's own method if not.
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
corepack prepare pnpm@10.30.3 --activate # catsper, cat-hotel
corepack prepare pnpm@10.4.1             # agents

# Global CLIs for repos that do not pin them as devDependencies.
npm install -g wrangler@4.129.0 @shopify/cli@4.8.0 # branding (wrangler), catati-horizon (shopify)

# Playwright Chromium builds, with system libraries, for each pinned Playwright version.
npx -y playwright@1.63.0 install --with-deps chromium # catsper, catati-horizon
npx -y playwright@1.62.1 install --with-deps chromium # cat-hotel

# --- Python ----------------------------------------------------------------------
uv python install 3.13                         # agents
uv pip install --system --quiet fonttools brotli # branding scripts/build-fonts.py

# --- Shell lint tools pinned by agents (Makefile, .github/workflows/test-check.yml) ---
curl -fsSL -o /usr/local/bin/shfmt \
  https://github.com/mvdan/sh/releases/download/v3.14.1/shfmt_v3.14.1_linux_amd64
echo "76e77641faa025814b77f153b29796b8e6fa2fca03e0c76a691608b86c7ea7bf  /usr/local/bin/shfmt" | sha256sum -c -
chmod +x /usr/local/bin/shfmt

tmp=$(mktemp -d)
curl -fsSL -o "$tmp/shellcheck.tar.xz" \
  https://github.com/koalaman/shellcheck/releases/download/v0.11.0/shellcheck-v0.11.0.linux.x86_64.tar.xz
echo "8c3be12b05d5c177a04c29e3c78ce89ac86f1595681cab149b65b97c4e227198  $tmp/shellcheck.tar.xz" | sha256sum -c -
tar -xJf "$tmp/shellcheck.tar.xz" -C "$tmp"
install "$tmp/shellcheck-v0.11.0/shellcheck" /usr/local/bin/shellcheck
rm -rf "$tmp"

echo "catati cloud setup: done"
