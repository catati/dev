#!/usr/bin/env bash
# Catati cloud dev environment: setup script for claude.ai/code.
# Runs as root on Ubuntu 24.04 x86_64 before Claude starts. Environment variables are not set yet.
# A non-zero exit fails session start, so keep every step idempotent.
set -euo pipefail

dl_dir=$(mktemp -d)
trap 'rm -rf "$dl_dir"' EXIT

# Download <url> to <file> in dl_dir and check its SHA-256 before anything uses it.
fetch_verified() {
  local url=$1 sha=$2 file=$3
  curl -fsSL -o "$dl_dir/$file" "$url"
  echo "$sha  $dl_dir/$file" | sha256sum -c -
}

# --- System packages ---------------------------------------------------------
# jq: catati-horizon's scripts/check-theme.sh and Claude hooks.
apt-get update -qq
apt-get install -y -qq jq

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
uv python install 3.13 # agents
# branding scripts/build-fonts.py. Ubuntu marks the system Python as externally managed (PEP 668).
uv pip install --system --break-system-packages --quiet fonttools brotli

# --- Pinned binaries (versions and SHA-256 copied from each repo's CI) -------------
# shfmt and shellcheck: agents Makefile and .github/workflows/test-check.yml.
fetch_verified https://github.com/mvdan/sh/releases/download/v3.14.1/shfmt_v3.14.1_linux_amd64 \
  76e77641faa025814b77f153b29796b8e6fa2fca03e0c76a691608b86c7ea7bf shfmt
install "$dl_dir/shfmt" /usr/local/bin/shfmt

fetch_verified https://github.com/koalaman/shellcheck/releases/download/v0.11.0/shellcheck-v0.11.0.linux.x86_64.tar.xz \
  8c3be12b05d5c177a04c29e3c78ce89ac86f1595681cab149b65b97c4e227198 shellcheck.tar.xz
tar -xJf "$dl_dir/shellcheck.tar.xz" -C "$dl_dir"
install "$dl_dir/shellcheck-v0.11.0/shellcheck" /usr/local/bin/shellcheck

# gitleaks: knowledge `make verify` (.github/workflows/kb.yml); skipped silently if missing.
fetch_verified https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz \
  551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb gitleaks.tar.gz
tar -xzf "$dl_dir/gitleaks.tar.gz" -C "$dl_dir" gitleaks
install "$dl_dir/gitleaks" /usr/local/bin/gitleaks

echo "catati cloud setup: done"
