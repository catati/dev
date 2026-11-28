# catati/dev

catati/dev sets the standard that every Catati repo follows, and holds the tools that apply it. Agents build every Catati repo with [pstack](https://github.com/cursor/plugins/tree/main/pstack). catati/dev supplies only what pstack needs from a repo and leaves out anything pstack already does.

## What is in this repo

| Part | Folder | What it does | Reference |
| --- | --- | --- | --- |
| Conventions | [`plugins/catati/conventions/`](plugins/catati/conventions/) | The rules for names, branches, deploys, CI, issues, merges, specs and tests. | [Conventions](#conventions) |
| `catati` CLI | [`plugins/catati/scripts/`](plugins/catati/scripts/), [`plugins/catati/lib/`](plugins/catati/lib/), [`plugins/catati/templates/`](plugins/catati/templates/) | `catati check` lists where a repo breaks the rules. `catati setup` writes the files every repo carries. | [`docs/cli.md`](docs/cli.md) |
| `catati` plugin | [`plugins/catati/`](plugins/catati/) | A Claude Code plugin with the `/catati:setup-dev` skill, the session hooks and the guard hook. It also carries the conventions, the CLI and the templates, so the skill needs no copy of catati/dev. | [`docs/plugin.md`](docs/plugin.md) |
| Cloud environment | [`env/`](env/) | The `dev` environment on claude.ai/code, kept as files. | [`docs/cloud-environment.md`](docs/cloud-environment.md) |
| Verifier record | [`plugins/catati/templates/verifier-record/`](plugins/catati/templates/verifier-record/) | Posts the `verifier-record` status on a PR's head. It is green only when the latest `catati-ops` comment whose first line is `VERIFIER PASS <head>` or `VERIFIER FAIL <head>` is a PASS. Its description also says who merges, from the [one-way-door list](plugins/catati/templates/verifier-record/doors.md). `catati setup` copies these files into each repo, catati/dev included. | [Check the verifier record in CI](#check-the-verifier-record-in-ci) |

## Common tasks

### Set a repo up to the standard

In a cloud session that has the repo, run:

```text
/catati:setup-dev
```

The skill runs `catati setup` in the repo, fixes the conventions link in `CLAUDE.md`, creates missing status labels and lists the GitHub settings that differ from the conventions. It then opens one PR. If the repo already meets the standard, the skill opens no PR and reports "already up to date".

In a claude.ai project, `/catati:setup-dev project` switches the project's scheduled reports off. Projects run no SOD, Hourly or EOD routines: coding work is tracked in GitHub issues and PRs, and the operator's hub project reads them (operator, 2026-11-28).

Run the skill again after each catati/dev release to bring the repo up to the new standard.

### Check a repo without changing it

The CLI uses only Node built-ins, so it runs with no install. The `catati` plugin carries it, so a session that syncs the plugin already has it. From anywhere inside the repo, run:

```sh
cli=$(ls -t $(find ~/.claude/plugins -path '*/catati/scripts/catati.mjs') | head -1)
node "$cli" check
```

In catati/dev itself, run `node plugins/catati/scripts/catati.mjs check`.

Each output line names a check, a path and the problem:

```text
make-targets: Makefile: no target test
ci-workflow: .github/workflows/ci.yml: file is missing
```

The command exits with 0 when it finds nothing. To see what `catati setup` would change, run `node "$cli" setup --dry-run`.

### Accept a finding for a while

To turn off one check for one file until a date, add this line to the file:

```text
# catati-allow(<check>): <reason>; expires YYYY-MM-DD; approved by <name>
```

`<name>` is the person who approved the exception. A line with no approver is itself a finding. For JSON files and files that cannot hold a comment, see [Allow lines](docs/cli.md#allow-lines).

### Check the verifier record in CI

`/catati:setup-dev` copies three files from [`plugins/catati/templates/verifier-record/`](plugins/catati/templates/verifier-record/): the workflow to `.github/workflows/verifier-record.yml`, and the script and its door list to `.github/verifier-record/`. The workflow runs on `pull_request_target`, and on `issue_comment` only when the comment's body starts with `VERIFIER `, or did before an edit, so other comments use no Actions minutes. It checks out the repo's own default branch, never the PR head, and posts the `verifier-record` status on the PR's head. A new push turns the status red until a record names the new head.

The description also says who merges: `an agent merges`, `the operator merges (<path>)` when the PR changes a one-way-door path, with ` +N` when it changes N more, or `door list unreadable` when the script could not work out which changed paths are doors. That last one still posts the verdict, and the job log names the error.

To make a merge need it, add `verifier-record` to the required status checks of the ruleset that guards `main`. A repo calls no catati/dev workflow. `catati check` fails a `uses:` that names catati/dev (`dev-dependency`).

### Change the cloud environment

The environment form on claude.ai/code has no API, so each field has a source file in `env/`. Change the file first, then copy it into the form.

1. Change the files in `env/` in a PR.
2. After the merge, paste each changed file into its field of the `dev` form. [The form fields](docs/cloud-environment.md#the-form-fields) lists the file for each field.
3. Start a new cloud session.
4. In the new session, ask Claude to run `check-tools`, `node -v`, `corepack --version`, `uv --version` and `agent-browser open https://github.com && agent-browser snapshot -i`. Node must be `v24.15` or later, and the snapshot must list the page's links.
5. Check that `~/.claude/rules/pstack-models.md` exists.
6. Check that the session lists `/pstack:poteto-mode`, `/catati:setup-dev` and `catati:agent-browser`.
7. Run the repo's install step. [Repos in the environment](docs/cloud-environment.md#repos-in-the-environment) lists each one.

### Release a change to catati/dev

1. Make the change in a PR.
2. If the PR changes the plugin, raise `version` in both `package.json` and `plugins/catati/.claude-plugin/plugin.json`. Sessions pick up a plugin change only when its version changes. `npm test` fails when the two versions differ.
3. Run `make verify`. It runs `npm test`, then `catati check` on catati/dev itself. CI runs the same target on every PR and on each push to `main`.

The `check` ruleset requires two checks before a PR merges. They are the `verify` job in `ci.yml` and the [`verifier-record` status](#check-the-verifier-record-in-ci). The `record` job in `.github/workflows/verifier-record.yml` posts that status. Four more checks run on every PR, and the ruleset requires none of them. The `record` job reports its own `record` check. CodeQL default setup runs `CodeQL`, `Analyze (actions)` and `Analyze (javascript-typescript)`.

## How catati/dev and pstack split the work

pstack decides how an agent plans, builds, verifies, opens a PR and merges. catati/dev decides what a Catati repo looks like, so that those steps work the same way in every repo. That covers names, the `make verify` gate, the git hooks, the deploy paths and who may change prod.

When pstack already covers something, catati/dev adds nothing for it. For example, pstack's Opening a PR playbook sets PR titles and bodies, so catati/dev ships no PR template. The merge rules in [`issues-and-prs.md`](plugins/catati/conventions/issues-and-prs.md#merges) add only the two things pstack leaves open. They set the format of the verifier record, and they name the merges that the operator does. The operator is the person behind the `catati-ops` GitHub account.

## Conventions

Each rule in [`plugins/catati/conventions/`](plugins/catati/conventions/) ends with what enforces it:

- `catati check` means the CLI checks the rule on each `/catati:setup-dev` run.
- `judgment` means a reviewer checks the rule, because no tool does yet.
- A test file, such as `test/worktree.test.mjs`, means that test proves the rule.

Only catati/dev runs `catati check` in its own CI. Other repos get it through `/catati:setup-dev`, so they never pin a copy of catati/dev.

| File | What it covers |
| --- | --- |
| [`naming.md`](plugins/catati/conventions/naming.md) | Names of repos, resources, versions, make targets, CI checks, files and labels, and the recorded exceptions. |
| [`branches.md`](plugins/catati/conventions/branches.md) | Branches, the `main` and `check` rulesets, and session start. |
| [`deploy.md`](plugins/catati/conventions/deploy.md) | The `dev` and `prod` environments, the deploy pipeline, the `deploy-prod` and `apply-prod` jobs, config, secrets and migrations. |
| [`issues-and-prs.md`](plugins/catati/conventions/issues-and-prs.md) | `CLAUDE.md`, issues, the verify gates, opening and watching a PR, the verifier record, one-way-door paths and who merges. |
| [`specs.md`](plugins/catati/conventions/specs.md) | What a design spec holds, including running cost and the platform-native alternative. |
| [`ci.md`](plugins/catati/conventions/ci.md) | The `changes` job that runs only the CI jobs a diff affects, job gates, drafts, pushes to `main`, action pins and required checks. |
| [`repo-settings.md`](plugins/catati/conventions/repo-settings.md) | The GitHub settings a repo keeps: Dependabot, rulesets, the `prod` environment review and the status labels. |
| [`testing.md`](plugins/catati/conventions/testing.md) | The unit, integration and e2e layers, their make targets, and what only production exercises. |
