---
name: repo-setup
description: Set a Catati repo up to the catati/dev standard, or bring it up to date after catati/dev changes. Use for /catati:repo-setup, "set this repo up to the standard", or re-running repo setup.
---

# Repo setup

Run this in the git repo the person names, or the one that holds the current directory. Each run converges the repo on the standard. A run changes nothing and opens no PR when the repo is up to date and `catati/dev` `main` has not moved since the last pin. A moved pin alone is a real update and gets a PR.

`catati setup` writes every mechanical file. This skill pins the package, runs it, does the `CLAUDE.md` judgment steps, checks the repo's GitHub settings, and opens one PR.

## 1. Branch

The base branch is `main`, or `dev` in `catati-horizon`. Work on the branch the session was assigned. If `HEAD` is the base branch, run `git fetch origin <base>` and create `repo-setup` from `origin/<base>`, so the branch starts from the current base. Every commit and push goes to that work branch.

## 2. Pin `@catati/dev`

1. Resolve the head of `catati/dev` `main` as a full 40-character SHA: `git ls-remote https://github.com/catati/dev refs/heads/main`. A short SHA fails to install. Run `git fetch origin <base>`, then note the commit that the base's root `package.json` pins catati/dev at, under any key, as the old pin (`git show origin/<base>:package.json`). Step 5 runs the merge gate from it.
2. Remove each older pin of catati/dev from the root `package.json` `devDependencies`: a `catati-dev` key, and an `@catati/dev` key whose spec does not start with `git+https://`, such as `github:catati/dev#<sha>`. Use `pnpm remove -D <key>` or `npm uninstall -D <key>`, with `-w` for pnpm when `pnpm-workspace.yaml` exists.
3. Add `@catati/dev` as a dev dependency at that SHA with the package manager the repo's lockfile names. The spec is `git+https://github.com/catati/dev.git#<sha>`, because a cloud session fetches it through the git proxy, while a `github:` spec fetches from `codeload.github.com`, which a session reaches only for the repos attached to it.
   - `pnpm-lock.yaml`: `pnpm add -D 'git+https://github.com/catati/dev.git#<sha>'`. Add `-w` when `pnpm-workspace.yaml` exists, so the package lands in the root `package.json`.
   - `package-lock.json`: `npm install -D 'git+https://github.com/catati/dev.git#<sha>'`.
   - No `package.json` at the repo root: stop and report that the repo cannot pin `@catati/dev`.
4. Both package managers can save the spec as `github:catati/dev#<sha>`. If `package.json` then holds that spec, run `npm pkg set 'devDependencies.@catati/dev=git+https://github.com/catati/dev.git#<sha>'` and run the install command again (`pnpm install` or `npm install`), so the lockfile records the `git+https` spec. npm writes `resolved` as `git+ssh://git@github.com/catati/dev.git#<sha>`, which `catati check` accepts.
5. Run `node_modules/.bin/catati check`. If it does not run, or it prints a `catati-dev-lock` finding, stop and report its output. For a codeload form, rerun the skill from step 1 in a session that does not have catati/dev attached.
6. If `node_modules/@catati/dev/package.json` has a `version` other than the one in `../../.claude-plugin/plugin.json` from this skill's base directory, note both in the report. The plugin and the pinned package then come from different releases.

The installed package holds the rules as `node_modules/@catati/dev/conventions/` and the shared files as `node_modules/@catati/dev/templates/`. Read the conventions there.

## 3. Run `catati setup`

Run `node_modules/.bin/catati setup` from the repo root and keep its stdout and stderr.

- Each stdout line `created`, `updated` or `unchanged` names a file it wrote or left as is.
- Each `removed <path>` line names a file catati/dev no longer manages, such as the old PR template, which setup deleted.
- Each `skipped <path>: <reason>` line names a file a person must reconcile by hand. Leave those files as they are and list them in the report.
- The finding lines after the file lines are what `catati check` still finds. Setup does not change the `Makefile`, the CI workflows or the Biome and tsconfig bases, so those findings stay for the repo's own PR.

Exit code 2 means setup could not run. Stop and report its stderr line.

## 4. `CLAUDE.md`

Edit the repo's `CLAUDE.md`, or `AGENTS.md` when no `CLAUDE.md` exists. Keep every repo-specific rule. Change only what these items need.

1. **The conventions link.** The file links to `https://github.com/catati/dev/tree/main/conventions` as the shared rules.
2. **The rule table.** Apply the delete test of the rule-table rule in `conventions/issues-and-prs.md`: delete a row only when it adds nothing to the convention it restates. Leave every other row as it is, because the repo owns its wording. A row that names a repo enforcer, a repo name or account, or a stricter local form adds something, so a "No push to `main`" row that names `.githooks/pre-push` stays. When a kept row copies convention wording, list it in the report as a suggestion to link its convention section. When `CLAUDE.md` has no rule table, create one with the columns `Rule` and `Enforced by`. The table pairs each rule with what runs it today: a named check, hook, CI job, test or skill. A rule nothing runs yet reads `None`. Write `catati check` as the enforcer only when `make verify` runs it. State each rule once. When the table holds a rule, delete its prose copy elsewhere in the file.
3. **Exception lines.** Rewrite each `repo-check-allow(<check>): …` line in the repo to `catati-allow(<check>): <reason>; expires YYYY-MM-DD; approved by <name>`. Rewrite the format where `CLAUDE.md` and the repo's `README.md` state it, and the repo check that parses those lines, in the same PR.
   - Editing a file in a one-way-door path makes this PR a door. The repo check usually sits in `.github/**`, and an allow line can sit in a door file such as `api/wrangler.jsonc`, which `**/wrangler.jsonc` matches.
   - The `repo-check-allow` rewrite is all or nothing, because a check that reads only the new format stops reading any old line left behind. When it needs any door file, rewrite nothing and list each line, the format and the check in the report for the repo's own PR.
4. **Approvers.** The new pin's `catati check` fails a `catati-allow` line that names no approver, and the repo's hooks and CI fail with it. Never invent an approver. Ask the operator once for the missing names, and write only a name the operator gives, even in a door file. An approver written in a door file makes this PR a door. Without the names, stop before the push and report each line.

## 4b. Repo settings

Read the repo's GitHub settings and compare them with `conventions/repo-settings.md` and `conventions/branches.md`. Create missing status labels. Write nothing else to GitHub settings. When a read fails, report the call and its error in place of a value.

Make each call a plain `gh api <path>`, one per command, with no pipe or loop, so that no call waits on an approval prompt.

1. **Labels.** Read `templates/labels.json` and list the repo's labels with `gh api 'repos/{owner}/{repo}/labels?per_page=100'`. For each label in the file that the repo lacks, run `gh api 'repos/{owner}/{repo}/labels' -f name=<name> -f color=<color> -f description=<description>`. Leave existing labels as they are.
2. **Rulesets.** `gh api 'repos/{owner}/{repo}/rulesets'` lists them, and `gh api 'repos/{owner}/{repo}/rulesets/<id>'` returns each one's `rules` and `bypass_actors`. Read both `main` and `check`. The required checks live in `check`.
3. **Dependabot.** Alerts are on when `gh api 'repos/{owner}/{repo}/dependabot/alerts?per_page=1'` returns a list, and off when it returns a 403 that says they are disabled. The `security_and_analysis.dependabot_security_updates.status` field of `gh api 'repos/{owner}/{repo}'` is the security-update state.
4. **The `prod` environment.** The `required_reviewers` entry in `protection_rules` of `gh api 'repos/{owner}/{repo}/environments/prod'` names its reviewers.

## 5. Commit and open the PR

1. Run `git status`. With no change, skip to the report.
2. Commit the changed files, including `package.json` and the lockfile. The repo's git hooks run. Fix what they flag in the files this run changed.
3. Push the work branch. Never push the base branch.
4. If the work branch already has an open PR, update its body. Otherwise open one PR against the base branch. pstack decides its title, body and readiness (`playbooks/opening-a-pr.md` of the `poteto-mode` skill).
   - Issue: the PR always closes an issue in this repo. Use the issue that asked for this run. When none did, first open one in this repo from its `.github/ISSUE_TEMPLATE/issue.yml`, filling Card, What to build, Acceptance criteria and Blocked by. Title it `repo: Set the repo up to the catati/dev standard`, and note in it that it is part of catati/dev#8.
   - Body: the standard needs only `Closes #<N>` for that issue, and the `Blocked by:` line from item 7 when the PR has a merge order. The setup output, findings and skipped files go in the report.
5. Verification follows the pstack playbook in use, which decides who verifies and who posts the record. The record's first line is `VERIFIER PASS <full 40-character head SHA>`, per the Merges section of `conventions/issues-and-prs.md`.
6. Run `catati check-merge` from the base copy of `@catati/dev`, which is the old pin. Never run it from the new pin, because this PR is what moves it.

   ```sh
   gate=$(mktemp -d)
   git init -q "$gate/src"
   git -C "$gate/src" fetch -q --depth 1 https://github.com/catati/dev <old pin>
   git -C "$gate/src" archive -o "$gate/gate.tar" <old pin> bin lib
   tar -xf "$gate/gate.tar" -C "$gate"
   node "$gate/bin/catati.mjs" check-merge origin/<base> HEAD
   ```

   Exit 0 means only that no listed door path changed. A change that touches production is still the operator's to merge. Any other exit, or no old pin, means a door. With no door and no production change, the PR merges per the pstack playbook in use, once the record names its head and the required CI is green. With a door, the operator merges it.
7. If this PR must merge before or after another PR, record the order in the later PR's body as one line `Blocked by: <ref>, <ref>`. Each ref is `#N` or `owner/repo#N`, per the Merges section of `conventions/issues-and-prs.md`. Do not add a native `blocked_by` dependency to a PR, because GitHub refuses one on a PR. Once catati/dev#95 lands, the prod guard refuses the merge while a named issue or PR is open.

## 6. Report

Reply with:

- the old pin and the new pin;
- the setup output;
- each skipped file and why a person must reconcile it;
- each remaining `catati check` finding;
- what changed in `CLAUDE.md`, and each kept rule-table row to link to its convention section;
- each exception line left for the repo's own PR, and each approver written with the operator's name for it;
- each label created, each repo setting that differs from the conventions, and each read that failed;
- the merge gate output, and who merges;
- the PR URL, or "already up to date" when the run changed nothing.
