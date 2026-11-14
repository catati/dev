---
name: repo-setup
description: Set a Catati repo up to the catati/dev standard, or bring it up to date after catati/dev changes. Use for /catati:repo-setup, "set this repo up to the standard", or re-running repo setup.
---

# Repo setup

Run this in the git repo the person names, or the one that holds the current directory. Each run converges the repo on the standard. A run on a repo that is already up to date changes nothing, opens no PR and reports "already up to date".

The repo takes no dependency on catati/dev. This skill fetches the standard, runs `catati setup` from that copy, removes the old pin wiring, does the `CLAUDE.md` judgment steps, checks the repo's GitHub settings, and opens one PR.

## 1. Fetch the standard

Shell variables do not carry from one tool call to the next. So this step prints the standard's folder once, and every later command writes that path out in full where this skill says `<standard>`.

1. Clone catati/dev `main` into a new temp folder outside the repo, and print the folder:

   ```sh
   standard="$(mktemp -d)/dev" && git clone --depth 1 https://github.com/catati/dev "$standard" && echo "$standard"
   ```

   If the clone fails, stop. Report that the run cannot fetch the standard, with git's last error line. The run has then written nothing in the repo.
2. Run `git -C <standard> remote get-url origin && git -C <standard> rev-parse HEAD`. The first line must be `https://github.com/catati/dev`. Anything else means the path is wrong, so stop and report what it printed. Record the second line as the standard's SHA.
3. Read the rules in `<standard>/conventions/` and the shared files in `<standard>/templates/`. Every later step reads them from there.
4. If the `version` in `<standard>/package.json` differs from the one in `../../.claude-plugin/plugin.json` from this skill's base directory, note both in the report. The plugin and the standard then come from different releases.

## 2. Branch

The base branch is `main`, or `dev` in `catati-horizon`. Work on the branch the session was assigned. If `HEAD` is the base branch, run `git fetch origin <base>` and create `repo-setup` from `origin/<base>`, so the branch starts from the current base. Every commit and push goes to that work branch.

## 3. Run `catati setup`

Run `node <standard>/bin/catati.mjs setup` from the repo root and keep its stdout and stderr. It needs no install, because the CLI imports only Node built-ins and its own files.

- Each stdout line `created`, `updated` or `unchanged` names a file it wrote or left as is.
- Each `removed <path>` line names a file catati/dev no longer manages, such as the old PR template, which setup deleted.
- Each `skipped <path>: <reason>` line names a file a person must reconcile by hand. Leave those files as they are and list them in the report.
- The finding lines after the file lines are what `catati check` still finds. Setup does not change the `Makefile`, the CI workflows or the Biome and tsconfig bases, so those findings stay for the repo's own PR.

Setup exits 0 when it ran. Any other exit code means it did not run, such as 2 when it cannot read the repo or 1 when Node cannot load the CLI. Stop and report the exit code and the last stderr line.

## 3b. Remove the old pin

An older run pinned catati/dev as a package. Remove each part of that wiring the repo still has, and list each removal in the report.

1. **The dev dependency.** Remove an `@catati/dev` or `catati-dev` key from the root `package.json`, with the package manager the repo's lockfile names: `pnpm remove -D <key>` (add `-w` when `pnpm-workspace.yaml` exists) or `npm uninstall -D <key>`. That also removes its lockfile entries, such as a `git+https://github.com/catati/dev.git#<sha>` resolution. Then `git grep -n 'catati/dev' -- package.json pnpm-lock.yaml package-lock.json` prints nothing.
2. **`catati check` in the gate.** Remove a `catati check` call from the `Makefile` `verify` target, a package script or a CI step, such as `npx catati check` or `$(PNPM) exec catati check`. Remove only the call, and keep the rest of the target or script.
3. **`catati session-start`.** Remove a `catati session-start` call from a `Makefile` target, and a SessionStart hook in `.claude/settings.json` that runs it. Drop a `SessionStart` list, and then a `hooks` object, that the removal leaves empty. The plugin's own SessionStart hook does the setup part in every session.
4. **Repo checks of the pin.** Leave a check the repo wrote for the pin, such as cat-hotel's `catatiDevLockUse`, and the docs that name it. List each one in the report as a follow-up for the repo's own PR.
5. **Lines that name the old wiring.** Run `git grep -n -e 'catati check' -e 'catati session-start' -e '@catati/dev'` from the repo root. It also finds `catati check-merge` and `node_modules/@catati/dev/` paths. For each line it prints:
   - When the line names wiring this step removed and holds no other rule, such as a `make help` line or a doc sentence that lists `catati check` among the steps of `make verify`, drop that part, or the whole line when nothing true is left. A path under `node_modules/@catati/dev/` becomes the same path under `https://github.com/catati/dev/blob/main/`.
   - When the line is still true as it stands, such as one that says a `/catati:repo-setup` run checks a rule, leave it.
   - Leave every other line, such as one that documents a check from item 4 or a rule that relies on the removed wiring. List it in the report as a follow-up, with its path and line number.

## 4. `CLAUDE.md`

Edit the repo's `CLAUDE.md`, or `AGENTS.md` when no `CLAUDE.md` exists. Keep every repo-specific rule. Change only what these items need.

1. **The conventions link.** The file links to `https://github.com/catati/dev/tree/main/conventions` as the shared rules.
2. **The rule table.** Apply the delete test of the rule-table rule in `conventions/issues-and-prs.md`: delete a row only when it adds nothing to the convention it restates. Leave every other row as it is, because the repo owns its wording. A row that names a repo enforcer, a repo name or account, or a stricter local form adds something, so a "No push to `main`" row that names `.githooks/pre-push` stays. When a kept row copies convention wording, list it in the report as a suggestion to link its convention section. When `CLAUDE.md` has no rule table, create one with the columns `Rule` and `Enforced by`. The table pairs each rule with what runs it today: a named check, hook, CI job, test or skill. A rule nothing runs yet reads `None`. A rule that only `catati check` reads names `/catati:repo-setup` as its enforcer, because only a setup run runs that check. State each rule once. When the table holds a rule, delete its prose copy elsewhere in the file.
3. **Exception lines.** Rewrite each `repo-check-allow(<check>): …` line in the repo to `catati-allow(<check>): <reason>; expires YYYY-MM-DD; approved by <name>`. Rewrite the format where `CLAUDE.md` and the repo's `README.md` state it, and the repo check that parses those lines, in the same PR.
   - Editing a file in a [one-way-door path](https://github.com/catati/dev/blob/main/conventions/issues-and-prs.md#one-way-door-paths) makes this PR a door. The repo check usually sits in `.github/**`, and an allow line can sit in a door file such as `api/wrangler.jsonc`, which `**/wrangler.jsonc` matches.
   - The `repo-check-allow` rewrite is all or nothing, because a check that reads only the new format stops reading any old line left behind. When it needs any door file, rewrite nothing and list each line, the format and the check in the report for the repo's own PR.
4. **Approvers.** `catati check` reports a `catati-allow` line that names no approver as an `allow` finding. Never invent an approver. Ask the operator once for the missing names, and write only a name the operator gives, even in a door file. An approver written in a door file makes this PR a door. Without the names, list each such line in the report as a follow-up and go on.

## 4b. Repo settings

Read the repo's GitHub settings and compare them with `conventions/repo-settings.md` and `conventions/branches.md`. Create missing status labels. Write nothing else to GitHub settings. When a read fails, report the call and its error in place of a value.

Make each call a plain `gh api <path>`, one per command, with no pipe or loop, so that no call waits on an approval prompt.

1. **Labels.** Read `templates/labels.json` and list the repo's labels with `gh api 'repos/{owner}/{repo}/labels?per_page=100'`. For each label in the file that the repo lacks, run `gh api 'repos/{owner}/{repo}/labels' -f name=<name> -f color=<color> -f description=<description>`. Leave existing labels as they are.
2. **Rulesets.** `gh api 'repos/{owner}/{repo}/rulesets'` lists them, and `gh api 'repos/{owner}/{repo}/rulesets/<id>'` returns each one's `rules` and `bypass_actors`. Read both `main` and `check`. The required checks live in `check`.
3. **Dependabot.** Alerts are on when `gh api 'repos/{owner}/{repo}/dependabot/alerts?per_page=1'` returns a list, and off when it returns a 403 that says they are disabled. The `security_and_analysis.dependabot_security_updates.status` field of `gh api 'repos/{owner}/{repo}'` is the security-update state.
4. **The `prod` environment.** The `required_reviewers` entry in `protection_rules` of `gh api 'repos/{owner}/{repo}/environments/prod'` names its reviewers.

## 5. Commit and open the PR

1. Run `git status`. With no change, skip to the report and report "already up to date".
2. Commit the changed files, including `package.json` and the lockfile. The repo's git hooks run. Fix what they flag in the files this run changed.
3. Push the work branch. If the pre-push hook refuses, fix what it flags in the files this run changed, commit, and push again. A repo check that asks for a version bump, such as cat-hotel's `versionBumpMissing` after an approver lands in `api/wrangler.jsonc`, is an example: raise the version as the repo's `CLAUDE.md` says. Never skip a hook, and never push the base branch.
   - When a failure needs a file this run did not change, push no more and open no PR. The usual case is a check or test that needs the pin, which step 3b.4 leaves, such as cat-hotel's `overbooked-nights-guard.test.mjs`, which imports `@catati/dev`, and the SSH-lockfile test in `ci-contract.test.mjs`. List each failing check and its file in the report as a follow-up the repo's own PR removes, and say the commit is on the local work branch only.
4. If the work branch already has an open PR, update its body. Otherwise open one PR against the base branch. pstack decides its title, body and readiness (`playbooks/opening-a-pr.md` of the `poteto-mode` skill).
   - Issue: the PR always closes an issue in this repo. Use the issue that asked for this run. When none did, first open one in this repo from its `.github/ISSUE_TEMPLATE/issue.yml`, filling Card, What to build, Acceptance criteria and Blocked by. Title it `repo: Set the repo up to the catati/dev standard`, and note in it that it is part of catati/dev#8.
   - Body: the standard needs only `Closes #<N>` for that issue, and the `Blocked by:` line from item 7 when the PR has a merge order. When the run changed a version field, such as the root `package.json` `version`, the body's Blast Radius names each one. The setup output, findings and skipped files go in the report.
5. Verification follows the pstack playbook in use, which decides who verifies and who posts the record. The record's first line is `VERIFIER PASS <full 40-character head SHA>`, per the Merges section of `conventions/issues-and-prs.md`.
6. Decide who merges. List the changed files with `git diff --name-only origin/<base>...HEAD` and compare them with the one-way-door paths in `<standard>/conventions/issues-and-prs.md`. A PR that changes one of those paths, or whose merge changes prod, is a door, and the operator merges it. Removing the pin changes `package.json`, so that run's PR is a door. Any other PR merges per the pstack playbook in use, once the record names its head and the required CI is green.
7. If this PR must merge before or after another PR, record the order in the later PR's body as one line `Blocked by: <ref>, <ref>`. Each ref is `#N` or `owner/repo#N`, per the Merges section of `conventions/issues-and-prs.md`. Do not add a native `blocked_by` dependency to a PR, because GitHub refuses one on a PR.

## 6. Report

Reply with:

- the standard's SHA, and each part of the old pin the run removed;
- the setup output;
- each skipped file and why a person must reconcile it;
- each remaining `catati check` finding;
- what changed in `CLAUDE.md`, and each kept rule-table row to link to its convention section;
- each exception line left for the repo's own PR, each approver written with the operator's name for it, and each line still without an approver;
- each repo check of the pin left as a follow-up, and each line from step 3b.5 rewritten or left as a follow-up;
- each label created, each repo setting that differs from the conventions, and each read that failed;
- each door path the PR changes, and who merges;
- the PR URL, "already up to date" when the run changed nothing, or each check that stopped the push in step 5.3.
