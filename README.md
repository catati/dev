# catati/dev

catati/dev sets the standard that every Catati repo follows, and holds the tools that apply it. Agents build every Catati repo with [pstack](https://github.com/cursor/plugins/tree/main/pstack). catati/dev supplies only what pstack needs from a repo and leaves out anything pstack already does.

## What is in this repo

| Part | Folder | What it does | Reference |
| --- | --- | --- | --- |
| Conventions | [`conventions/`](conventions/) | The rules for names, branches, deploys, CI, issues, merges, specs and tests. | [Conventions](#conventions) |
| `catati` CLI | [`bin/`](bin/), [`lib/`](lib/), [`templates/`](templates/) | `catati check` lists where a repo breaks the rules. `catati setup` writes the files every repo carries. | [`docs/cli.md`](docs/cli.md) |
| `catati` plugin | [`plugins/catati/`](plugins/catati/) | A Claude Code plugin with the `/catati:repo-setup` and `/catati:project-setup` skills and the session hooks. | [`docs/plugin.md`](docs/plugin.md) |
| Cloud environment | [`env/`](env/) | The `dev` environment on claude.ai/code, kept as files. | [`docs/cloud-environment.md`](docs/cloud-environment.md) |
| Verifier record | [`.github/workflows/verifier-record.yml`](.github/workflows/verifier-record.yml), [`lib/verifier-record.mjs`](lib/verifier-record.mjs) | Posts the `verifier-record` status on a PR's head. It is green only when the latest `catati-ops` comment whose first line is `VERIFIER PASS <head>` or `VERIFIER FAIL <head>` is a PASS. Its description also says who merges, from the [one-way-door list](conventions/issues-and-prs.md#one-way-door-paths). | [Check the verifier record in CI](#check-the-verifier-record-in-ci) |

## Common tasks

### Set a repo up to the standard

In a cloud session that has the repo, run:

```text
/catati:repo-setup
```

The skill runs `catati setup` in the repo, fixes the conventions link in `CLAUDE.md`, creates missing status labels and lists the GitHub settings that differ from the conventions. It then opens one PR. If the repo already meets the standard, the skill opens no PR and reports "already up to date".

Run the skill again after each catati/dev release to bring the repo up to the new standard.

### Check a repo without changing it

The CLI uses only Node built-ins, so it runs from a fresh clone with no install. From anywhere inside the repo, run:

```sh
tmp=$(mktemp -d)
git clone --depth 1 https://github.com/catati/dev "$tmp"
node "$tmp/bin/catati.mjs" check
```

Each output line names a check, a path and the problem:

```text
make-targets: Makefile: no target test
ci-workflow: .github/workflows/ci.yml: file is missing
```

The command exits with 0 when it finds nothing. To see what `catati setup` would change, run `node "$tmp/bin/catati.mjs" setup --dry-run`.

### Accept a finding for a while

To turn off one check for one file until a date, add this line to the file:

```text
# catati-allow(<check>): <reason>; expires YYYY-MM-DD; approved by <name>
```

`<name>` is the person who approved the exception. A line with no approver is itself a finding. For JSON files and files that cannot hold a comment, see [Allow lines](docs/cli.md#allow-lines).

### Check the verifier record in CI

catati/dev runs its own `verifier-record.yml` on each of its PRs. Another repo calls it with this `.github/workflows/verifier-record.yml`:

```yaml
name: Verifier record

on:
  pull_request_target:
    types: [opened, synchronize, reopened, ready_for_review]
  issue_comment:
    types: [created, edited, deleted]

permissions:
  contents: read

jobs:
  record:
    permissions:
      contents: read
      pull-requests: read
      statuses: write
    uses: catati/dev/.github/workflows/verifier-record.yml@<sha> # vX.Y.Z
```

`<sha>` is the full commit SHA of a catati/dev release, and the comment names its version. The called job checks out catati/dev at that commit, never the PR head, and runs `lib/verifier-record.mjs` from it. It reads the PR and posts the status through the API with the caller's token, so the caller grants exactly the three permissions above. A new push turns the status red until a record names the new head. The description also says who merges: `an agent merges`, `the operator merges (<path>)` when the PR changes a one-way-door path, with ` +N` when it changes N more, or `door list unreadable` when the script could not work out which changed paths are doors. That last one still posts the verdict, and the job log names the error. To make a merge need it, add `verifier-record` to the required status checks of the ruleset that guards `main`.

### Change the cloud environment

The environment form on claude.ai/code has no API, so each field has a source file in `env/`. Change the file first, then copy it into the form.

1. Change the files in `env/` in a PR.
2. After the merge, paste each changed file into its field of the `dev` form. [The form fields](docs/cloud-environment.md#the-form-fields) lists the file for each field.
3. Start a new cloud session.
4. In the new session, ask Claude to run `check-tools`, `node -v`, `corepack --version` and `uv --version`. Node must be `v24.15` or later.
5. Check that `~/.claude/rules/pstack-models.md` exists.
6. Check that the session lists `/pstack:poteto-mode`, `/catati:repo-setup` and `/catati:project-setup`.
7. Run the repo's install step. [Repos in the environment](docs/cloud-environment.md#repos-in-the-environment) lists each one.

### Release a change to catati/dev

1. Make the change in a PR.
2. If the PR changes the plugin, raise `version` in both `package.json` and `plugins/catati/.claude-plugin/plugin.json`. Sessions pick up a plugin change only when its version changes. `npm test` fails when the two versions differ.
3. Run `make verify`. It runs `npm test`, then `catati check` on catati/dev itself. CI runs the same target on every PR and on each push to `main`.

The `check` ruleset requires two checks before a PR merges, the `verify` job in `ci.yml` and the [`verifier-record` status](#check-the-verifier-record-in-ci). The `record` job in `.github/workflows/verifier-record.yml` posts that status. Its own `record` check runs too, but the ruleset does not require it.

## How catati/dev and pstack split the work

pstack decides how an agent plans, builds, verifies, opens a PR and merges. catati/dev decides what a Catati repo looks like, so that those steps work the same way in every repo. That covers names, the `make verify` gate, the git hooks, the deploy paths and who may change prod.

When pstack already covers something, catati/dev adds nothing for it. For example, pstack's Opening a PR playbook sets PR titles and bodies, so catati/dev ships no PR template. The merge rules in [`conventions/issues-and-prs.md`](conventions/issues-and-prs.md#merges) add only the two things pstack leaves open. They set the format of the verifier record, and they name the merges that the operator does. The operator is the person behind the `catati-ops` GitHub account.

## Conventions

Each rule in `conventions/` ends with what enforces it:

- `catati check` means the CLI checks the rule on each `/catati:repo-setup` run.
- `judgment` means a reviewer checks the rule, because no tool does yet.
- A test file, such as `test/worktree.test.mjs`, means that test proves the rule.

Only catati/dev runs `catati check` in its own CI. Other repos get it through `/catati:repo-setup`, so they never pin a copy of catati/dev.

| File | What it covers |
| --- | --- |
| [`naming.md`](conventions/naming.md) | Names of repos, resources, versions, make targets, CI checks, files and labels, and the recorded exceptions. |
| [`branches.md`](conventions/branches.md) | Branches, the `main` and `check` rulesets, and session start. |
| [`deploy.md`](conventions/deploy.md) | The `dev` and `prod` environments, the deploy pipeline, the `deploy-prod` and `apply-prod` jobs, config, secrets and migrations. |
| [`issues-and-prs.md`](conventions/issues-and-prs.md) | `CLAUDE.md`, issues, the verify gates, opening and watching a PR, the verifier record, one-way-door paths and who merges. |
| [`specs.md`](conventions/specs.md) | What a design spec holds, including running cost and the platform-native alternative. |
| [`ci.md`](conventions/ci.md) | The `changes` job that runs only the CI jobs a diff affects, job gates, drafts, pushes to `main`, action pins and required checks. |
| [`repo-settings.md`](conventions/repo-settings.md) | The GitHub settings a repo keeps: Dependabot, rulesets, the `prod` environment review and the status labels. |
| [`testing.md`](conventions/testing.md) | The unit, integration and e2e layers, their make targets, and what only production exercises. |
