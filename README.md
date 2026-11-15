# catati/dev

catati/dev holds Catati's engineering standard and the tools that apply it. Every Catati repo builds with [pstack](https://github.com/cursor/plugins/tree/main/pstack). catati/dev supplies what a repo needs for pstack to work there, and adds nothing that pstack already handles.

The repo has four parts:

| Part | Where | What it is |
| --- | --- | --- |
| Conventions | [`conventions/`](conventions/) | The rules every Catati repo follows: names, branches, deploys, CI, issues and merges. |
| `catati` CLI | [`bin/`](bin/), [`lib/`](lib/), [`templates/`](templates/) | `catati check` finds where a repo breaks the rules. `catati setup` writes the files every repo carries. |
| `catati` plugin | [`plugins/catati/`](plugins/catati/) | A Claude Code plugin with the `/catati:repo-setup` skill and the session hooks. |
| Cloud environment | [`env/`](env/) | The `dev` environment on claude.ai/code, as files. |

## Get started

Most people need one of the tasks below. The [Reference](#reference) section lists the full behaviour of each tool.

### Set a repo up to the standard

To bring a repo up to the standard, run the setup skill in a cloud session that has the repo:

```text
/catati:repo-setup
```

The skill fetches catati/dev `main`, runs `catati setup` in the repo, fixes the `CLAUDE.md` conventions link, creates missing status labels and reports how the repo's GitHub settings differ from the conventions. It then opens one PR. A repo that is already up to date gets no PR, and the skill reports "already up to date".

Run the skill again after each catati/dev release. Each run converges the repo on the current standard.

### Check a repo without changing it

A repo takes no dependency on catati/dev. The CLI imports only Node built-ins and its own files, so it runs from a fresh clone with no install. From anywhere inside the repo, run:

```sh
tmp=$(mktemp -d)
git clone --depth 1 https://github.com/catati/dev "$tmp"
node "$tmp/bin/catati.mjs" check
```

Each line names a check, a path and the problem. A repo with only an `install` target prints lines such as:

```text
templates-equal: .github/ISSUE_TEMPLATE/issue.yml: file is missing
make-targets: Makefile: no target test
ci-workflow: .github/workflows/ci.yml: file is missing
```

The command exits with 0 when it finds nothing. To see what `catati setup` would change, run `node "$tmp/bin/catati.mjs" setup --dry-run`.

### Accept a finding for a time

To turn off a check for one file until a date, add an allow line to that file:

```text
# catati-allow(<check>): <reason>; expires YYYY-MM-DD; approved by <name>
```

Write the name of the person who allowed the exception. A line with no approver is itself a finding. For JSON files, files that cannot hold a comment and the full rules, see [Allow lines](#allow-lines).

### Change the cloud environment

The environment form on claude.ai/code has no API, so each field is a file here. Change the file, not the form.

1. Change the files in `env/` in a PR.
2. After the merge, paste each changed file into its field of the `dev` form. [Cloud environment](#cloud-environment) maps each field to its file.
3. Start a new cloud session.
4. In the new session, ask Claude to run `check-tools`, `node -v`, `corepack --version` and `uv --version`. Expect Node `v24.15` or later.
5. Check that `~/.claude/rules/pstack-models.md` exists.
6. Check that the session lists `/pstack:poteto-mode` and `/catati:repo-setup`.
7. Run the install step of the repo in the session. [Repos in the environment](#repos-in-the-environment) names each install step.

### Release a change to catati/dev

1. Make the change in a PR.
2. If the PR changes the plugin, raise `version` in both `package.json` and `plugins/catati/.claude-plugin/plugin.json`. Synced sessions pick up a plugin change only when its version changes, and `npm test` fails when the two versions differ.
3. Run `make verify`. It runs `npm test`, then `catati check` on catati/dev itself. CI's `verify` job runs the same target on every PR and on each push to `main`.

## How catati/dev works with pstack

pstack decides how work gets done: how an agent plans, builds, verifies, opens a PR and merges. catati/dev decides what a Catati repo looks like, so that pstack's steps work the same way in every repo. That means names, the `make verify` gate, the git hooks, the deploy paths and who may change prod.

When pstack covers something, catati/dev adds no rule, template or check for it. PR titles and bodies follow pstack's Opening a PR playbook, for example, so catati/dev ships no PR template. The verifier record and the merge rules in [`conventions/issues-and-prs.md`](conventions/issues-and-prs.md#merges) add only what pstack leaves open: the record's format, and which merges are the operator's.

### Each rule names what enforces it

Every convention row ends with its check. `catati check` means each `/catati:repo-setup` run checks the rule. `judgment` means a reviewer checks it, because no tool does yet. A test file, such as `test/worktree.test.mjs`, means that test proves the rule.

Only catati/dev runs `catati check` in its own CI. Other repos run it through `/catati:repo-setup`, so they never pin a copy of catati/dev.

### Session hooks live in the plugin

Claude Code loads a repo's `.claude/settings.json` only when a session starts in that repo ([settings files](https://code.claude.com/docs/en/settings#settings-files)). A project thread that starts one folder up never runs those settings. Plugin hooks load in every session that syncs the plugin ([hooks](https://code.claude.com/docs/en/hooks)). So the hooks that every session needs live in the `catati` plugin, not in each repo.

The plugin has no prod guard hook. The control on prod is the rule in [Who changes prod](conventions/deploy.md#who-changes-prod). An agent changes prod only when the operator asks for that specific prod action.

### Repo contract

The cloud environment provides only runtimes and the OS libraries that need root. These are Node 24 (24.15 or later), corepack, uv and the system libraries for Playwright's Chromium.

Each repo declares every other tool it needs. Its own install step then sets the tool up the same way on a Mac, in CI and in the cloud.

| Tool | Where the repo declares it |
| --- | --- |
| npm CLIs, such as `wrangler`, `@shopify/cli` and Playwright | `devDependencies`, pinned in the lockfile. |
| The pnpm version | The `packageManager` field. |
| The Python version and packages | `requires-python` and the dependencies in `pyproject.toml`, run through `uv`. |
| Native binaries, such as `shfmt`, `shellcheck` and `gitleaks` | An install target that downloads a pinned version and checks its SHA-256. |
| Playwright browsers | `playwright install chromium` in the install step. |

Do not add a repo tool to [`env/setup.sh`](env/setup.sh). Fix the repo instead. The one step in `env/setup.sh` that installs no runtime writes the pstack model rule. The rule belongs to the user, not to a repo, and the setup script is the only step that runs in every session.

## Reference

### Conventions

| File | What it covers |
| --- | --- |
| [`naming.md`](conventions/naming.md) | Names of repos, resources, versions, make targets, CI checks, files and labels, and the recorded exceptions. |
| [`branches.md`](conventions/branches.md) | Branches, the `main` and `check` rulesets, and session start. |
| [`deploy.md`](conventions/deploy.md) | The `dev` and `prod` environments, the deploy pipeline, the `deploy-prod` and `apply-prod` jobs, config, secrets and migrations. |
| [`issues-and-prs.md`](conventions/issues-and-prs.md) | `CLAUDE.md`, issues, the verify gates, the verifier record, one-way-door paths and who merges. |
| [`ci.md`](conventions/ci.md) | The `changes` job that runs only the CI jobs a diff affects, job gates, drafts, pushes to `main` and required checks. |
| [`repo-settings.md`](conventions/repo-settings.md) | The GitHub settings a repo keeps: Dependabot, rulesets, the `prod` environment review and the status labels. |
| [`testing.md`](conventions/testing.md) | The unit, integration and e2e layers, their make targets, and what only production exercises. |

[`templates/`](templates/) holds the files that `catati setup` copies. `templates/labels.json` holds the four status labels as an array of `name`, `color` and `description` objects. `catati setup` creates no labels from it. `/catati:repo-setup` does.

### `catati check`

```text
node bin/catati.mjs check
```

`catati check` checks the rules marked `catati check` in `conventions/`. It reads the whole git repo that holds the current directory, so it works from any subdirectory. It compares the repo with the `templates/` folder of its own copy of catati/dev, so it needs no network.

| Exit code | Meaning |
| --- | --- |
| `0` | No findings. |
| `1` | One or more findings, one per line on stdout, as `<check>: <path>: <problem>`. |
| `2` | The check could not run, for example outside a git repo or on a file it cannot read. One line on stderr says why. |

| Check | Fails when |
| --- | --- |
| `templates-equal` | `.github/ISSUE_TEMPLATE/issue.yml` is missing or differs by a byte from `templates/`. |
| `make-targets` | The `Makefile` has no `install`, `test`, `e2e`, `verify`, `lint`, `help`, `format` or `staged-check` target, or no `deploy-dev` target in a repo with a `wrangler.jsonc`. The template git hooks call `make staged-check` before a commit and name `make format` when they refuse one. |
| `version-source` | A repo with a `wrangler.jsonc` outside `node_modules/` has no root `package.json`, or its `version` is not `MAJOR.MINOR.PATCH`, such as `2.0.0` (no `v`, no leading zero, no pre-release). Or another `package.json` outside `node_modules/` declares a `version`. The root holds the one version the repo ships. A repo with no `wrangler.jsonc` skips this check. |
| `ci-workflow` | `.github/workflows/ci.yml` is missing. |
| `workflow-names` | A `.yml` or `.yaml` file in `.github/workflows/` is not `ci.yml`, `deploy.yml` or `verifier-record.yml`. Other files there, such as a `README.md`, are not workflows, and no check reads them. |
| `env-names` | A `wrangler.jsonc` has an `env` key other than `dev` or `prod`. Or a workflow's `environment` is not `dev` or `prod` and does not end in `-dev` or `-prod`. A matrix list is skipped. Or an environment word (`production`, `development`, `staging` or `preview`, in any case) names a config file or a Terraform root outside `node_modules/`. A config file is `<base>.<word>.<toml\|json\|jsonc\|yaml\|yml>`, such as `shopify.app.production.toml`, or `.env.<word>`, or `.dev.vars.<word>`. A Terraform root is a folder named `<word>` that directly holds a `.tf` file. Other paths, such as `link-preview.vue` or `production-plans.json`, pass. |
| `secret-names` | A workflow reads `secrets.<NAME>` where a `_` token of the name is `DEV`, `PROD`, `PRODUCTION`, `DEVELOPMENT`, `STAGING` or `CATATI`. |
| `wrangler-envs` | A `wrangler.jsonc` lacks `env.dev` or `env.prod`, each with a string `name` and `account_id`. Or a command runs a remote Wrangler command without `--env` or `-e`. See [How `wrangler-envs` reads commands](#how-wrangler-envs-reads-commands). Any command that passes `--keep-vars` is also a finding. |
| `resource-names` | A resource name in a `wrangler.jsonc`, at the top level or in an `env.<name>`, is not `<repo>` or `<repo>-<component>`, or ends in `-dev`, `-prod`, `-production`, `-development` or `-staging`. `<repo>` is the last part of the `origin` remote URL, without `.git`. A repo with no `origin` remote skips this check. Resource names are `name`, `d1_databases[].database_name`, `r2_buckets[].bucket_name`, `queues.producers[].queue`, `queues.consumers[].queue` and `dead_letter_queue`, and `workflows[].name`. No other key is read, so `vars`, `ratelimits`, `send_email` and `durable_objects` bindings pass. |
| `env-example` | An env template, such as `example.env` or `.env.sample`, is not named `.env.example`. Real env files, such as `.env` and `.prod.env`, are not templates. |
| `allow` | An allow line is expired or malformed, or names no approver. See [Allow lines](#allow-lines). |

#### How `wrangler-envs` reads commands

The check reads the commands in `package.json` scripts, in a `Makefile`, and in the `deploy_command` and `build_command` of a `builds.json`. A remote Wrangler command is `deploy`, `versions`, `d1 migrations apply`, `d1 execute --remote`, `secret`, `triggers` or `rollback`.

- A command with an argument that is only a variable the check cannot expand, such as `$$ENV_ARGS`, is skipped, because that variable may hold `--env`.
- A variable given as the value of a Wrangler flag, such as `--name ${X}`, does not skip the command.
- In a `Makefile`, the check reads only recipe lines, never comments, and skips `echo` and `printf` commands. It expands `$(NAME)` and `${NAME}` from `=`, `:=`, `?=` and `+=` variable lines, and reads commands inside `(` and `)`.
- The check splits commands at `&&`, `||`, `;` and `|` without reading quotes. A separator inside a quoted string therefore splits the command there too.

### Allow lines

An allow line turns off one check for a time:

```text
# catati-allow(<check>): <reason>; expires YYYY-MM-DD; approved by <name>
```

| Rule | Detail |
| --- | --- |
| Scope | The line turns off its check for every finding in the file that holds it, until the end of the date. It covers the whole file, because some findings have no line of their own, such as a missing `Makefile` target. |
| Approver | `<name>` is the person who allowed the exception, so each exception traces back to a person. A line with no `approved by <name>` is an `allow` finding, including a line written before the approver was required. |
| JSON files | A JSON file holds the line as a string value, such as `"//": "catati-allow(<check>): <reason>; expires YYYY-MM-DD; approved by <name>"` in `package.json`. |
| `.catati-allow` | A file that cannot hold a comment or a string, such as a template or a missing file, takes its line in `.catati-allow` at the repo root, one line per check. A line there turns off its check for the whole repo. |
| Expired or malformed | The line is an `allow` finding and turns off nothing. A date that does not exist, such as `2026-02-31`, makes the line malformed. `catati check` reports these lines in every file a check reads, also when the file has no other finding. |
| Repo checks | A repo's own checks use the same format, such as `catati-allow(commentUse): …`. In any file other than `.catati-allow`, `catati check` skips a line that names a check it does not have, and leaves that line to the repo check that reads it. A misspelled check name in such a file therefore turns off nothing, and `catati check` does not report it. `.catati-allow` holds only `catati check` lines, so an unknown check name there is malformed. |

### `catati setup`

```text
node bin/catati.mjs setup [--dry-run]
```

`catati setup` writes the files every Catati repo carries, in the git repo that holds the current directory. A run on a repo that is already up to date changes nothing.

| File | What `setup` does |
| --- | --- |
| `.github/ISSUE_TEMPLATE/issue.yml` | Copies `templates/issue.yml`. |
| `.githooks/pre-commit`, `.githooks/pre-push` | Copies `templates/githooks/` and sets the exec bit. |
| `.node-version` | Copies `templates/node-version`, which holds `24`. Repo CI reads it through `node-version-file`. |
| `.github/pull_request_template.md`, `.github/workflows/pr-format.yml` | Deletes each one, because catati/dev no longer manages them. |

A copy replaces the whole file when one byte differs, and keeps the file's mode. `setup` does not touch the `Makefile`, `ci.yml`, `.github/CODEOWNERS`, `package.json`, `CLAUDE.md`, or the Biome and tsconfig bases. No ruleset asks for code-owner review, so `CODEOWNERS` enforces nothing, and the operator already merges those paths as [one-way doors](conventions/issues-and-prs.md#one-way-door-paths).

`setup` prints one line per file, then the findings of `catati check`. Those findings are the changes `setup` does not make.

| Line | Meaning |
| --- | --- |
| `created <path>`, `updated <path>`, `unchanged <path>` | What `setup` did with a managed file. |
| `removed <path>` | `setup` deleted a file it no longer manages. A second run finds none and prints nothing for them. |
| `skipped <path>: <reason>` | `setup` left a managed path as is, because the path is not a regular file, such as a symlink, or its parent directory, such as `.github`, is a symlink. A link that leads out of the repo reads `skipped <path>: resolves outside the repo`. A link inside the repo is skipped too, because Git commits the link, not the files behind it. A file it would delete is skipped on the same terms. |
| `<check>: <path>: <problem>` | A `catati check` finding that is left after the run. |

| Exit code | Meaning |
| --- | --- |
| `0` | `setup` ran, with or without findings. If it skipped a file, its last line goes to stderr as `catati: setup skipped <n> file(s); the standard is not fully applied`. A caller, such as a skill, reads stderr to learn that a person must look at the skipped files. |
| `2` | `setup` could not run, for example outside a git repo. One line on stderr says why. |

With `--dry-run`, `setup` prints the same lines and writes nothing. The findings then show what a real run would leave.

### `catati` plugin

This repo is a Claude Code plugin marketplace, [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json), with one plugin, `catati`, in `plugins/catati/`. The plugin sits in a subfolder because claude.ai rejects a plugin with a top-level `bin/`, and this repo has one.

The operator adds this marketplace at account level on claude.ai, beside the `cursor/plugins` marketplace and its `pstack` plugin. catati/dev does not ship pstack. Account plugins sync into sessions started from the app, not into sessions started through the sessions API ([#25](https://github.com/catati/dev/issues/25)).

A synced plugin holds only its own folder, so the skill cannot run the repo's `bin/`. The skill clones catati/dev into a temp folder and runs `bin/catati.mjs` from there.

| Part | What it does |
| --- | --- |
| [`/catati:repo-setup`](plugins/catati/skills/repo-setup/SKILL.md) | Clones catati/dev `main` and runs `catati setup` from it in the target repo. Removes an old `@catati/dev` pin. Adds the `CLAUDE.md` conventions link, and drops rule-table rows that only restate a convention. Creates missing status labels, and reports how the repo's GitHub settings differ from the conventions. Opens one PR and leaves its body and merge to pstack. |
| SessionStart hook [`session-start.mjs`](plugins/catati/hooks/session-start.mjs) | Installs `~/.claude/rules/pstack-models.md` when it is missing. Where a repo has a `.githooks` folder and no other `core.hooksPath`, points `core.hooksPath` at it. It acts in each repo of the session: the repo that holds `CLAUDE_PROJECT_DIR` (or the current directory), or else each repo directly below it, as in a project thread that starts in `/home/user`. It prints a line only for a problem. |
| WorktreeCreate and WorktreeRemove hook [`worktree.mjs`](plugins/catati/hooks/worktree.mjs) | Makes `Agent` with `isolation: "worktree"` work where the session starts above the repos. See [Worktree subagents](#worktree-subagents). |

The plugin `version` in `plugins/catati/.claude-plugin/plugin.json` equals the `version` in `package.json`.

#### Worktree subagents

In a repo, the hook adds a locked worktree at `<toplevel>/.claude/worktrees/<name>` on branch `worktree-<name>`, as Claude Code does. In a folder that is not a repo, such as `/home/user` in a project thread, it makes `<cwd>/.claude/worktrees/<name>/` with one locked worktree per repo directly below, at the same relative paths.

- Each worktree starts at its repo's `HEAD`, not `origin/HEAD`, so a subagent sees the root's unpushed work.
- Each branch records `catatiBase` and gets `pushRemote=no-push`. That setting stops a bare `git push` only, not `git push origin <ref>`.
- A worktree has no `node_modules`, so a subagent that runs tests runs `make install` first.
- Subagents commit and never push. Only the root pushes.

A `WorktreeCreate` hook replaces Claude Code's own `git worktree` logic in every session, local ones included. Claude Code then skips `.worktreeinclude`. Claude Code also does not call `WorktreeRemove` when a subagent ends, because it cannot tell whether a hook-made worktree holds changes. So the root cleans up after each subagent:

1. Merge the subagent's branch. When two subagents ran in parallel, cherry-pick instead.

	```sh
	git -C <repo> merge --ff-only worktree-<name>
	```

2. Remove the worktree:

	```sh
	node "$(ls -t $(find ~/.claude/plugins -path '*/catati/hooks/worktree.mjs') | head -1)" remove <worktree path>
	```

Remove refuses any path that is not a `…/worktrees/<name>` folder. It deletes a clean worktree on its own `worktree-<name>` branch, and deletes that branch when it has no commits beyond `catatiBase`. Like `git worktree remove`, it deletes ignored files, such as `.env` or `.dev.vars`, in a worktree it counts as clean. It keeps a worktree locked and exits with 1 when the worktree is dirty, holds another worktree of its repo, holds a repo or worktree inside an ignored folder, or is on another branch. An untracked nested repo or worktree counts as dirty. It still removes a worktree whose HEAD reflog holds commits on no branch, such as one an amend replaced, and prints their hashes.

### Cloud environment

Each field of the `dev` environment form has one source file.

| Form field | Source |
| --- | --- |
| Name | `dev` |
| Network access | Custom. Paste [`env/network-allowlist.txt`](env/network-allowlist.txt), and tick "also allow default package managers". |
| Environment variables | Paste [`env/.env.example`](env/.env.example), then fill the blank values in the form. Use dev values only, because every user of the environment can read them. |
| Setup script | Paste [`env/setup.sh`](env/setup.sh). |

**Network allowlist.** Never block a Catati domain. The allowlist holds each zone in the Cloudflare `Catati` account, as the apex and as `*.`. When a zone is added there, add it to the list and to `catatiZones` in [`test/network-allowlist.test.mjs`](test/network-allowlist.test.mjs).

**Setup script.** `env/setup.sh` installs Node 24, enables corepack, checks that uv is present and installs the Playwright system libraries. Before Claude starts, it also writes the pstack model rule to `~/.claude/rules/pstack-models.md` when that file is missing, so a session without the plugin still has the rule. `npm test` fails when the copy in `env/setup.sh` differs from `plugins/catati/rules/pstack-models.md`.

**GitHub access.** Install the Claude GitHub App on the `catati` organization. Every repo in the next section lives there.

#### Rules for `env/.env.example`

Treat every committed value as public.

| Kind of value | Where it goes |
| --- | --- |
| A value that is not secret | Commit it in `env/.env.example`. |
| A secret | Keep the name with a blank value in `env/.env.example`. Fill the value only in the form. |
| A value that identifies a Catati account but grants no access, such as `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL` and `SHOPIFY_SHOP` | Keep the name with a blank value in `env/.env.example`. Fill the value only in the form. |
| A value that differs per repo | Commit it in that repo, not here. |

> [!WARNING]
> Keep production credentials out of this shared environment. `CLOUDFLARE_API_TOKEN` is the dev user token `catati-dev/all`. Its Account Resources hold only the `catati-dev` account, never the production `Catati` account. It is a user token because the Workers Builds API rejects account tokens (error 12006).

### Repos in the environment

Cloudflare is the only serverless provider. Firebase is being removed, so this environment does not provide it.

| Repo | Install in a session | Gap against the repo contract | Notes |
| --- | --- | --- | --- |
| `catsper` | `make install` | None. `make install` already runs `playwright install chromium`. | No `.git/env` in the cloud, so `configure` reports `web/.env` as missing. `make integration-test` and `make e2e-test` run Firebase emulators, which this environment does not provide. The `catsper-dev` Worker exists in Cloudflare, but `catsper` `main` has no `wrangler` config yet. |
| `cat-hotel` | `make install` | None. `@shopify/cli` is a root devDependency (catati/cat-hotel#255), and `make install` runs `pnpm install` and `playwright install chromium` (catati/cat-hotel#223). | `wrangler` is already a devDependency. `shopify app deploy --config dev` needs `SHOPIFY_SERVICE_ACCOUNT_TOKEN`. |
| `agents` | `make tools-install` | None. `make tools-install` installs the pinned `shfmt` and `shellcheck` (catati/agents#570, on `main` through catati/agents#572). | Python comes from `requires-python` in `tools/product-labels/pyproject.toml`. `make gmail-auth` and `mcp-deploy ENV=prod` run only on a Mac. |
| `catati-horizon` | `npm ci` | Fixed on `dev` only (catati/catati-horizon#60). The fix declares `@shopify/cli`, drops `jq` and installs Playwright Chromium. The gap stays open until the fix reaches `main`, the default branch that cloud sessions clone. | `shopify theme dev` needs `SHOPIFY_CLI_THEME_TOKEN`. |
| `branding` | `npm ci`, and Python scripts through `uv run` | None. `package.json` pins `wrangler`, and `pyproject.toml` declares `fonttools` and `brotli` (catati/branding#5). | |
| `knowledge` | `make install` | None. `make install` runs `gitleaks-install` (catati/knowledge#13). | |

A row with an open gap means that the repo's sessions lack the tool until the repo's fix reaches `main`. When the fix reaches `main`, set the row's gap to "None".

These repos are not reachable from the cloud. `hermes` and `catati-video` are not on GitHub. `ads`, `products` and `catati-products` have no Git remote.
