#!/usr/bin/env bash
# Catati cloud dev environment: setup script for claude.ai/code.
# Runs as root on Ubuntu 24.04 before Claude starts. Environment variables are not set yet.
# A non-zero exit fails session start, so keep every step idempotent.
#
# Scope: runtimes, root-only OS libraries and the pstack model rule. Repo tools belong in each repo
# (see README "Repo contract").
set -euo pipefail

# --- pstack model rule -----------------------------------------------------------
# Claude loads ~/.claude/rules/ at start. A session whose primary directory is not a repo
# runs no repo's SessionStart hook, so this is the one step that reaches every session.
# It runs first so the rule lands even when a later step fails. A rule the user already has wins.
# Keep the text equal to templates/pstack-models.md; npm test fails when they differ.
rules_dir="${HOME:-/root}/.claude/rules"
if [ ! -e "$rules_dir/pstack-models.md" ]; then
  mkdir -p "$rules_dir"
  staged="$(mktemp "$rules_dir/.pstack-models.XXXXXX")"
  chmod 644 "$staged"
  cat >"$staged" <<'RULE'
# pstack model configuration. One line per role. Delete a line to fall back to the skill default.
# `inherit-parent` or `auto` as a value: the role runs on the parent chat model (omit Agent `model`). Alias entries in a panel list still count toward its fan-out.
# budget: large (xhigh)
feature, refactoring: inherit-parent
bug-fix: inherit-parent
perf-issue: inherit-parent
hillclimb: inherit-parent
judgment and prose: opus xhigh
hardest tasks: opus xhigh
how explorer: inherit-parent
how explainer: opus xhigh
why investigators: inherit-parent
why synthesizer: opus xhigh
reflect tooling: inherit-parent
reflect judgment, divergent, synthesizer: opus xhigh
arena runners: opus xhigh, inherit-parent
arena cross-judge pool: opus xhigh, inherit-parent
swarm workers: inherit-parent
architect runners: opus xhigh, inherit-parent
interrogate reviewers: opus xhigh, inherit-parent
RULE
  ln "$staged" "$rules_dir/pstack-models.md" 2>/dev/null || true
  rm -f "$staged"
fi

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
