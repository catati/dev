---
name: repo-setup
description: Set a Catati repo up to the catati/dev standard, or bring it up to date after catati/dev changes. Use for /catati:repo-setup, "set this repo up to the standard", or re-running repo setup.
---

# Repo setup

Run this in the git repo the person names, or the one that holds the current directory. Each run converges the repo on the standard. A run changes nothing and opens no PR when the repo is up to date and `catati/dev` `main` has not moved since the last pin. A moved pin alone is a real update and gets a PR.

`catati-dev setup` writes every mechanical file. This skill pins the package, runs it, does the `CLAUDE.md` judgment steps, and opens one PR.

## 1. Branch

The base branch is `main`, or `dev` in `catati-horizon`. Work on the branch the session was assigned. If `HEAD` is the base branch, run `git fetch origin <base>` and create `repo-setup` from `origin/<base>`, so the branch starts from the current base. Every commit and push goes to that work branch.

## 2. Pin `catati-dev`

1. Resolve the head of `catati/dev` `main` as a full 40-character SHA: `git ls-remote https://github.com/catati/dev refs/heads/main`. A short SHA fails to install.
2. Add `catati-dev` as a dev dependency at that SHA with the package manager the repo's lockfile names:
   - `pnpm-lock.yaml`: `pnpm add -D github:catati/dev#<sha>`. Add `-w` when `pnpm-workspace.yaml` exists, so the package lands in the root `package.json`.
   - `package-lock.json`: `npm install -D github:catati/dev#<sha>`.
   - No `package.json` at the repo root: stop and report that the repo cannot pin `catati-dev`.
3. Check that `node_modules/.bin/catati-dev` runs. If `node_modules/catati-dev/package.json` has a `version` other than the one in `../../.claude-plugin/plugin.json` from this skill's base directory, note both in the report. The plugin and the pinned package then come from different releases.

The installed package holds the rules as `node_modules/catati-dev/conventions/` and the shared files as `node_modules/catati-dev/templates/`. Read the conventions there.

## 3. Run `catati-dev setup`

Run `node_modules/.bin/catati-dev setup` from the repo root and keep its stdout and stderr.

- Each stdout line `created`, `updated` or `unchanged` names a file it wrote or left as is.
- Each `skipped <path>: <reason>` line names a file a person must reconcile by hand. Leave those files as they are and list them in the report.
- The finding lines after the file lines are what `catati-dev check` still finds. Setup does not change the `Makefile`, the CI workflows or the Biome and tsconfig bases, so those findings stay for the repo's own PR.

Exit code 2 means setup could not run. Stop and report its stderr line.

## 4. `CLAUDE.md`

Edit the repo's `CLAUDE.md`, or `AGENTS.md` when no `CLAUDE.md` exists. Keep every repo-specific rule. Change only what these three items need.

1. **The poteto line.** One line reads "Build with `/pstack:poteto-mode`. This file wins over poteto on" and then names each override. The shared overrides are:
   - issue and PR titles are `<area>: <outcome>`;
   - the PR template starts with `## Why`;
   - merges are squash only, and only the operator merges;
   - a cloud session works on its assigned branch, cut from `main`. `catati-horizon` cuts from `dev` and targets `dev` until its spike.

   Add each override the file already states elsewhere, such as its PR format. One line holds them all.
2. **The conventions link.** The file links to `https://github.com/catati/dev/tree/main/conventions` as the shared rules.
3. **The rule table.** The table lists only rules that hold in this repo alone; the conventions link covers the shared ones. Delete any row, or prose copy, that restates a rule in `node_modules/catati-dev/conventions/`. When `CLAUDE.md` has no rule table, create one with the columns `Rule` and `Enforced by`. The table pairs each remaining rule with what runs it today: a named check, hook, CI job, test or skill. A rule nothing runs yet reads `None`. Write `catati-dev check` as the enforcer only when `make verify` runs it. State each rule once: when the table holds a rule, delete its prose copy elsewhere in the file.

## 5. Commit and open the PR

1. Run `git status`. With no change, skip to the report.
2. Commit the changed files, including `package.json` and the lockfile. The repo's git hooks run. Fix what they flag in the files this run changed.
3. Push the work branch. Never push the base branch.
4. If the work branch already has an open PR, update its body. Otherwise open one PR against the base branch:
   - Title: `repo: Set the repo up to the catati/dev standard`.
   - Issue: the PR always closes an issue in this repo. Use the issue that asked for this run. When none did, first open one in this repo from its `.github/ISSUE_TEMPLATE/issue.yml`, filling Card, What to build, Acceptance criteria and Blocked by. Title it `repo: Set the repo up to the catati/dev standard`, and note in it that it is part of catati/dev#8.
   - Body: the repo's `.github/pull_request_template.md`, every section kept, with `Closes #<N>` for that issue. Evidence quotes the setup output and lists each remaining finding and skipped file as a named gap.
5. Leave the merge to the operator.

## 6. Report

Reply with:

- the old pin and the new pin;
- the setup output;
- each skipped file and why a person must reconcile it;
- each remaining `catati-dev check` finding;
- what changed in `CLAUDE.md`;
- the PR URL, or "already up to date" when the run changed nothing.
