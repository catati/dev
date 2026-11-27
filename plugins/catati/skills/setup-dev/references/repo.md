# Repo setup

Run this in the git repo the person names, or the one that holds the current directory. Each run converges the repo on the standard. A run on a repo that is already up to date changes nothing, opens no PR and reports "already up to date".

The repo takes no dependency on catati/dev, and this run clones nothing. The standard ships in this plugin: the CLI, the templates and the conventions. This skill runs `catati setup` from the plugin, does the `CLAUDE.md` judgment steps, checks the repo's GitHub settings, and opens one PR.

## 1. Find the standard

Shell variables do not carry from one tool call to the next. So this step prints the plugin's folder once, and every later command writes that path out in full where this skill says `<plugin>`.

1. Run `cd <this skill's base directory>/../.. && pwd && node -p "require('./.claude-plugin/plugin.json').version"`. The first line is `<plugin>`, the second is the standard's version. If `<plugin>/scripts/catati.mjs` is missing, stop and report the path.
2. Read the rules in `<plugin>/conventions/` and the shared files in `<plugin>/templates/`. Every later step reads them from there.

## 2. Branch

The base branch is `main`, or `dev` in `catati-horizon`. Work on the branch the session was assigned. If `HEAD` is the base branch, run `git fetch origin <base>` and create `setup-dev` from `origin/<base>`, so the branch starts from the current base. Every commit and push goes to that work branch.

## 3. Run `catati setup`

Run `node <plugin>/scripts/catati.mjs setup` from the repo root and keep its stdout and stderr. It needs no install, because the CLI imports only Node built-ins and its own files.

- Each stdout line `created`, `updated` or `unchanged` names a file it wrote or left as is.
- Each `removed <path>` line names a file catati/dev no longer manages, such as the old PR template, which setup deleted.
- Each `skipped <path>: <reason>` line names a file a person must reconcile by hand. Leave those files as they are and list them in the report.
- The finding lines after the file lines are what `catati check` still finds. Setup does not change the `Makefile`, the CI workflows or the Biome and tsconfig bases, so those findings stay for the repo's own PR.

Setup exits 0 when it ran. Any other exit code means it did not run, such as 2 when it cannot read the repo or 1 when Node cannot load the CLI. Stop and report the exit code and the last stderr line.

## 4. `CLAUDE.md`

Edit the repo's `CLAUDE.md`, or `AGENTS.md` when no `CLAUDE.md` exists. Keep every repo-specific rule. Change only what these items need.

1. **The conventions link.** Remove any link to `https://github.com/catati/dev/tree/main/conventions` or to a file under it, and the sentence that only introduces it. The plugin's SessionStart hook gives every session the shared rules and the path to the conventions, so the repo needs no link. Where a kept sentence cites a convention section, name it in words, such as "the Merges section of the catati conventions".
2. **The rule table.** Read the shared rules text in `<plugin>/rules/catati-standard.md`; the plugin adds it to every session. Apply the delete test of the rule-table rule in `<plugin>/conventions/issues-and-prs.md`: delete a row only when it adds nothing to the convention or the shared rules text it restates. When you are unsure whether a row adds something, keep it and list it in the report. Leave every other row as it is, because the repo owns its wording. A row that names a repo enforcer, a repo name or account, or a stricter local form adds something, so a "No push to `main`" row that names `.githooks/pre-push` stays. When a kept row copies convention wording, list it in the report as a suggestion to link its convention section. When `CLAUDE.md` has no rule table, add none, because pstack's `/correct` keeps that table. In a table that exists, a rule that only `catati check` reads names `/catati:setup-dev` as its enforcer, because only a setup run runs that check. State each rule once. When the table holds a rule, delete its prose copy elsewhere in the file.
3. **Approvers.** `catati check` reports a `catati-allow` line that names no approver as an `allow` finding. Never invent an approver. Ask the operator once for the missing names, and write only a name the operator gives, even in a file at a one-way-door path (`<plugin>/conventions/issues-and-prs.md`). An approver written in a door file makes this PR a door. Without the names, list each such line in the report as a follow-up and go on.

## 4b. Repo settings

Read the repo's GitHub settings and compare them with `<plugin>/conventions/repo-settings.md` and `<plugin>/conventions/branches.md`. Create missing status labels. Write nothing else to GitHub settings. When a read fails, report the call and its error in place of a value.

Make each call a plain `gh api <path>`, one per command, with no pipe or loop, so that no call waits on an approval prompt.

1. **Labels.** Read `templates/labels.json` and list the repo's labels with `gh api 'repos/{owner}/{repo}/labels?per_page=100'`. For each label in the file that the repo lacks, run `gh api 'repos/{owner}/{repo}/labels' -f name=<name> -f color=<color> -f description=<description>`. Leave existing labels as they are.
2. **Rulesets.** `gh api 'repos/{owner}/{repo}/rulesets'` lists them, and `gh api 'repos/{owner}/{repo}/rulesets/<id>'` returns each one's `rules` and `bypass_actors`. Read both `main` and `check`. The required checks live in `check`.
3. **Dependabot.** Alerts are on when `gh api 'repos/{owner}/{repo}/dependabot/alerts?per_page=1'` returns a list, and off when it returns a 403 that says they are disabled. The `security_and_analysis.dependabot_security_updates.status` field of `gh api 'repos/{owner}/{repo}'` is the security-update state.
4. **The `prod` environment.** The `required_reviewers` entry in `protection_rules` of `gh api 'repos/{owner}/{repo}/environments/prod'` names its reviewers.

## 5. Commit and open the PR

1. Run `git status`. With no change, skip to the report and report "already up to date".
2. Commit the changed files. The repo's git hooks run. Fix what they flag in the files this run changed.
3. Push the work branch. If the pre-push hook refuses, fix what it flags in the files this run changed, commit, and push again. Never raise `version` to satisfy a check, because only a `release: X.Y.Z` PR changes it (`<plugin>/conventions/naming.md`, Versions). Never skip a hook, and never push the base branch.
   - When a failure needs a file this run did not change, push no more and open no PR. List each failing check and its file in the report as a follow-up the repo's own PR fixes, and say the commit is on the local work branch only.
4. If the work branch already has an open PR, update its body. Otherwise open one PR against the base branch. pstack decides its title, body and readiness (`playbooks/opening-a-pr.md` of the `poteto-mode` skill).
   - Issue: the PR always closes an issue in this repo. Use the issue that asked for this run. When none did, first open one in this repo from its `.github/ISSUE_TEMPLATE/issue.yml`, filling Card, What to build, Acceptance criteria and Blocked by. Title it `repo: Set the repo up to the catati/dev standard`.
   - Body: the standard needs only `Closes #<N>` for that issue, and the `Blocked by:` line from item 7 when the PR has a merge order. The setup output, findings and skipped files go in the report.
5. Verification follows the pstack playbook in use, which decides who verifies and who posts the record. The record's first line is `VERIFIER PASS <full 40-character head SHA>`, per the Merges section of `<plugin>/conventions/issues-and-prs.md`.
6. Decide who merges. List the changed files with `git diff --name-only origin/<base>...HEAD` and compare them with the one-way-door paths in `<plugin>/templates/verifier-record/doors.md`. A PR that changes one of those paths, or whose merge changes prod, is a door, and the operator merges it. Any other PR merges per the pstack playbook in use, once the record names its head and the required CI is green.
7. If this PR must merge before or after another PR, record the order in the later PR's body as one line `Blocked by: <ref>, <ref>`. Each ref is `#N` or `owner/repo#N`, per the Merges section of `<plugin>/conventions/issues-and-prs.md`. Do not add a native `blocked_by` dependency to a PR, because GitHub refuses one on a PR.

## 6. Report

Reply with:

- the standard's version;
- the setup output, including each `.claude/settings.json` rule and hook entry setup removed;
- each skipped file and why a person must reconcile it;
- each remaining `catati check` finding;
- what changed in `CLAUDE.md`, each kept rule-table row to link to its convention section, and each row you were unsure of and kept;
- each approver written with the operator's name for it, and each line still without an approver;
- each label created, each repo setting that differs from the conventions, and each read that failed;
- each door path the PR changes, and who merges;
- the PR URL, "already up to date" when the run changed nothing, or each check that stopped the push in step 5.3.
