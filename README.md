# catati/dev

Catati repos fully adopt pstack for development, and everything follows pstack. catati/dev exists to make each repo fully adopt pstack: it supplies what a repo needs for pstack to work there, and adds nothing pstack already handles.

This repo is the Catati dev cloud environment (`catati-dev` on claude.ai/code), as files.
Each field of the environment form has one source here. Change the file, not the form.

| Form field | Source |
|---|---|
| Name | `catati-dev` |
| Network access | Custom: paste [env/network-allowlist.txt](env/network-allowlist.txt), tick "also allow default package managers" |
| Environment variables | Paste [env/.env.example](env/.env.example), then fill the blank values in the form. Dev values only: every user of the environment can read them. |
| Setup script | Paste [env/setup.sh](env/setup.sh) |

Never block a Catati domain. The allowlist holds each zone in the Cloudflare `Catati` account, as the apex and `*.`. When a zone is added there, add it to the list and to `catatiZones` in [test/network-allowlist.test.mjs](test/network-allowlist.test.mjs).

[env/setup.sh](env/setup.sh) writes the pstack model rule to `~/.claude/rules/pstack-models.md` before Claude starts, only when the file is missing, so a session without the plugin still has it. `npm test` fails when the copy in `env/setup.sh` differs from `plugins/catati/rules/pstack-models.md`.

## Conventions

`conventions/` holds what a Catati repo gives pstack: names, repo shape, environments, the verify gate and the git hooks. `templates/` holds the files that `catati setup` writes, and `templates/labels.json`, the status labels as an array of `name`, `color` and `description` objects. `catati setup` stays offline and creates no labels from it.
Each rule names its check. A rule marked `catati check` is checked by each `/catati:repo-setup` run. A rule marked `judgment` needs a reviewer.

- [conventions/naming.md](conventions/naming.md) lists the names of repos, resources, versions, make targets, CI checks, files and labels, and the recorded exceptions.
- [conventions/branches.md](conventions/branches.md) covers branches, the `main` and `check` rulesets, and session start.
- [conventions/deploy.md](conventions/deploy.md) covers the `dev` and `prod` environments, the deploy pipeline, the `deploy-prod` job, config, secrets and migrations.
- [conventions/issues-and-prs.md](conventions/issues-and-prs.md) covers `CLAUDE.md`, issues, the verify gates, the verifier record and who merges.
- [conventions/ci.md](conventions/ci.md) covers the `changes` job that runs only the CI jobs a diff affects, how to gate them, drafts, pushes to `main` and required checks.
- [conventions/repo-settings.md](conventions/repo-settings.md) lists the GitHub settings a repo keeps: Dependabot, rulesets, the `prod` environment review and the status labels.
- [conventions/testing.md](conventions/testing.md) maps the unit, integration and e2e layers to make targets, and lists what only production exercises.

## Run `catati check`

`catati check` checks the rules marked `catati check` in `conventions/`.
It checks the whole git repo that holds the current directory, so you can run it from any subdirectory.
It compares the repo with the `templates/` folder of its own copy of catati/dev, so it needs no network.
It prints one line per finding, as `<check>: <path>: <problem>`, and exits with 1 if it finds any. Otherwise it exits with 0.
If it cannot run, for example outside a git repo or on a file it cannot read, it prints one line on stderr and exits with 2.

| Check | Fails when |
| --- | --- |
| `templates-equal` | `.github/ISSUE_TEMPLATE/issue.yml` is missing or differs by a byte from `templates/`. |
| `make-targets` | The `Makefile` has no `install`, `test`, `e2e`, `verify`, `lint`, `help`, `format` or `staged-check` target, or no `deploy-dev` target in a repo with a `wrangler.jsonc`. The template git hooks call `make staged-check` before a commit and name `make format` when they refuse one. |
| `version-source` | A repo with a `wrangler.jsonc` outside `node_modules/` has no root `package.json`, or its `version` is not `MAJOR.MINOR.PATCH`, such as `2.0.0` (no `v`, no leading zero, no pre-release). Or another `package.json` outside `node_modules/` declares a `version`. The root holds the one version the repo ships. A repo with no `wrangler.jsonc` skips this check. |
| `ci-workflow` | `.github/workflows/ci.yml` is missing. |
| `workflow-names` | A `.yml` or `.yaml` file in `.github/workflows/` is not `ci.yml` or `deploy.yml`. Other files there, such as a `README.md`, are not workflows, and no check reads them. |
| `env-names` | A `wrangler.jsonc` has an `env` key other than `dev` or `prod`, a workflow's `environment` is not `dev` or `prod` and does not end in `-dev` or `-prod` (a matrix list is skipped), or an environment word (`production`, `development`, `staging` or `preview`, in any case) names a config file or a Terraform root outside `node_modules/`. A config file is `<base>.<word>.<toml|json|jsonc|yaml|yml>`, such as `shopify.app.production.toml`, `.env.<word>` or `.dev.vars.<word>`. A Terraform root is a folder named `<word>` that directly holds a `.tf` file. Other paths, such as `link-preview.vue` or `production-plans.json`, pass. |
| `secret-names` | A workflow reads `secrets.<NAME>` where a `_` token of the name is `DEV`, `PROD`, `PRODUCTION`, `DEVELOPMENT`, `STAGING` or `CATATI`. |
| `wrangler-envs` | A `wrangler.jsonc` lacks `env.dev` or `env.prod`, each with a string `name` and `account_id`. Or a command in a `package.json` script, a `Makefile` or the `deploy_command` and `build_command` of a `builds.json` runs a remote Wrangler command (`deploy`, `versions`, `d1 migrations apply`, `d1 execute --remote`, `secret`, `triggers`, `rollback`) without `--env` or `-e`. A command with an argument that is only a variable the check cannot expand, such as `$$ENV_ARGS`, is skipped, because that variable may hold `--env`. A variable given as the value of a Wrangler flag, such as `--name ${X}`, does not skip the command. Any command that passes `--keep-vars` is also a finding. In a `Makefile` it reads only recipe lines, never comments, and skips `echo` and `printf` commands. It expands `$(NAME)` and `${NAME}` from `=`, `:=`, `?=` and `+=` variable lines, and reads commands inside `(` and `)`. It splits commands at `&&`, `\|\|`, `;` and `\|` without reading quotes, so a separator inside a quoted string splits there too. |
| `resource-names` | A resource name in a `wrangler.jsonc`, at the top level or in an `env.<name>`, is not `<repo>` or `<repo>-<component>`, or ends in `-dev`, `-prod`, `-production`, `-development` or `-staging`. `<repo>` is the last part of the `origin` remote URL, without `.git`. A repo with no `origin` remote skips this check. Resource names are `name`, `d1_databases[].database_name`, `r2_buckets[].bucket_name`, `queues.producers[].queue`, `queues.consumers[].queue` and `dead_letter_queue`, and `workflows[].name`. No other key is read, so `vars`, `ratelimits`, `send_email` and `durable_objects` bindings pass. |
| `env-example` | An env template, such as `example.env` or `.env.sample`, is not named `.env.example`. Real env files, such as `.env` and `.prod.env`, are not templates. |

A repo takes no dependency on catati/dev. The CLI imports only Node built-ins and its own files, so it runs from a clone with no install:

```sh
tmp=$(mktemp -d)
git clone --depth 1 https://github.com/catati/dev "$tmp"
node "$tmp/bin/catati.mjs" check
```

Each `/catati:repo-setup` run does this through `catati setup`, which prints the same findings. Only catati/dev runs `catati check` in its own CI.

To accept a finding for a time, add this line to the file that has the finding:

```text
# catati-allow(<check>): <reason>; expires YYYY-MM-DD; approved by <name>
```

`<name>` is the person who allowed the exception, so each one traces back to a person.

The line turns off that check for every finding in the file that holds it, until the end of the date.
It covers the whole file, not one line, because some findings have no line of their own. A missing `Makefile` target is an example.

A JSON file holds the line as a string value, such as `"//": "catati-allow(<check>): <reason>; expires YYYY-MM-DD; approved by <name>"` in `package.json`.

A file that cannot hold a comment or a string, such as a template or a missing file, takes its line in `.catati-allow` at the repo root, one line per check.
A line in `.catati-allow` turns off its check for the whole repo.

An expired or malformed allow line is a finding with the check `allow`, and it turns off nothing.
A date that does not exist, such as `2026-02-31`, makes the line malformed.
A line with no `approved by <name>` is a finding too, such as one written before the approver was required.

A repo's own checks use the same format, such as `catati-allow(commentUse): <reason>; expires YYYY-MM-DD; approved by <name>`. In any file other than `.catati-allow`, `catati check` skips a line that names a check it does not have, and leaves that line to the repo check that reads it. So a misspelled check name in such a file turns off nothing and is not reported. `.catati-allow` holds only `catati check` lines, so an unknown check name there is malformed.

To test the package, run `npm test`.
The `verify` check in [.github/workflows/ci.yml](.github/workflows/ci.yml) runs `npm test` on every PR and on each push to `main`.

## Run `catati setup` to set a repo up to the standard

`catati setup` writes the files every Catati repo carries, in the git repo that holds the current directory.
Run it again at any time to bring the repo up to date. A run on a repo that is already up to date changes nothing.

| File | What `setup` does |
| --- | --- |
| `.github/ISSUE_TEMPLATE/issue.yml` | Copies `templates/issue.yml`. |
| `.githooks/pre-commit`, `.githooks/pre-push` | Copies `templates/githooks/`, and sets the exec bit. |
| `.node-version` | Copies `templates/node-version`, which holds `24`. Repo CI reads it through `node-version-file`. |

It prints one line per file, as `created <path>`, `updated <path>` or `unchanged <path>`.
It also deletes each file it used to manage and no longer does, `.github/pull_request_template.md` and `.github/workflows/pr-format.yml`, and prints `removed <path>` for each one it finds. A second run finds none and prints nothing for them. It skips such a path when it is not a regular file or sits under a symlinked directory.
A copy replaces the whole file when one byte differs, and keeps the file's mode.
It prints `skipped <path>: <reason>` and leaves the file as is when it skips a managed path that is not a regular file, such as a symlink.
It skips a managed path whose parent directory, such as `.github`, is a symlink. If the link leads out of the repo, the line reads `skipped <path>: resolves outside the repo`.
A link that stays in the repo is skipped too. Git commits the link, not the files behind it, so the files would land at a path the standard does not name.

After the files, it prints the findings of `catati check`, such as a missing `e2e` target. Those are the changes `setup` does not make.
With `--dry-run`, it prints the same lines and writes nothing. The findings then show what would be left after a real run.
It exits with 0, also when it prints findings. If it cannot run, for example outside a git repo, it prints one line on stderr and exits with 2.
If it skipped a file, its last line goes to stderr, as `catati: setup skipped <n> file(s); the standard is not fully applied`, and it still exits with 0.
A caller such as a skill reads stderr to learn that the repo needs a person to look at the skipped files.

`setup` does not touch the `Makefile`, `ci.yml`, `.github/CODEOWNERS`, `package.json`, `CLAUDE.md`, or the Biome and tsconfig bases.
It neither writes nor removes a repo's `.github/CODEOWNERS`. No ruleset asks for code-owner review, so the file enforces nothing, and the operator already merges those paths as [one-way doors](conventions/issues-and-prs.md#one-way-door-paths).

catati/dev runs its own standard. `make verify` runs `npm test` and then `catati check` on catati/dev, and CI's `verify` job runs `make verify`.

## Use the `catati` plugin

This repo is also a Claude Code plugin marketplace, `.claude-plugin/marketplace.json`, with one plugin, `catati`, in `plugins/catati/`.
The plugin sits in a subfolder because claude.ai rejects a plugin with a top-level `bin/`, and this repo has one.

The operator adds the marketplace at account level on claude.ai. Account plugins sync into sessions started from the app, not into sessions started through the sessions API (#25).
A synced plugin holds only its own folder, so the skill cannot run the repo's `bin/`. It clones catati/dev into a temp folder and runs `bin/catati.mjs` from there.

| Part | What it does |
| --- | --- |
| `/catati:repo-setup` | Clones catati/dev `main` into a temp folder and runs `catati setup` from it in the target repo, removes an old `@catati/dev` pin, adds the `CLAUDE.md` conventions link and the rule table, creates missing status labels, reports how the repo's GitHub settings differ from the conventions, then opens one PR and leaves its body and merge to pstack. A repo already up to date gets no PR. Run it again after each `catati/dev` release. |
| SessionStart hook `session-start.mjs` | Installs a missing `~/.claude/rules/pstack-models.md`, and, where a repo has a `.githooks` folder and no other `core.hooksPath`, points `core.hooksPath` at it, in each repo of the session: the repo that holds `CLAUDE_PROJECT_DIR` (or the cwd), or else each repo directly below it, as in a project thread that starts in `/home/user`. It prints a line only for a problem. |
| WorktreeCreate and WorktreeRemove hook `worktree.mjs` | Makes `Agent` with `isolation: "worktree"` work where the session starts above the repos. In a repo it adds a locked worktree at `<toplevel>/.claude/worktrees/<name>` on branch `worktree-<name>`, as Claude Code does. In a folder that is no repo, such as `/home/user` in a project thread, it makes `<cwd>/.claude/worktrees/<name>/` with one locked worktree per repo directly below, at the same relative paths. Each worktree starts at its repo's `HEAD`, not `origin/HEAD`, so a subagent sees the root's unpushed work. Each branch records `catatiBase` and gets `pushRemote=no-push`. Remove deletes a clean worktree on its own `worktree-<name>` branch, and that branch when it has no commits beyond `catatiBase`. It keeps, locked, a worktree that is dirty (an untracked nested repo or worktree counts), holds another worktree of its repo, or is on another branch, and exits 1. |

A `WorktreeCreate` hook replaces Claude Code's own `git worktree` logic in every session, local ones included, and Claude Code then skips `.worktreeinclude`. Claude Code does not call `WorktreeRemove` when a subagent ends, because it cannot tell whether a hook-made worktree holds changes. So the root cleans up: merge each subagent's branch with `git -C <repo> merge --ff-only worktree-<name>` (or cherry-pick when two ran in parallel), then run `node "$(ls -t $(find ~/.claude/plugins -path '*/catati/hooks/worktree.mjs') | head -1)" remove <worktree path>`. Remove refuses any path that is not a `…/worktrees/<name>` folder. Like `git worktree remove`, it deletes ignored files (such as `.env` or `.dev.vars`) in a worktree it counts as clean. Subagents commit and never push; only the root pushes. A worktree has no `node_modules`, so a subagent that runs tests runs `make install` first. `pushRemote=no-push` stops a bare `git push` only, not `git push origin <ref>`.

Repo `.claude/settings.json` files load only when a session starts in that repo, so a project thread that starts one folder up never runs them ([settings](https://code.claude.com/docs/en/settings#settings-files)). Plugin hooks load in every session that syncs the plugin ([hooks](https://code.claude.com/docs/en/hooks)). That is why the session hooks live here, not in each repo.

The plugin has no prod guard hook. The control on prod is the rule in [Who changes prod](conventions/deploy.md#who-changes-prod): an agent changes prod only when the operator asks for that specific prod action.

The plugin `version` in `plugins/catati/.claude-plugin/plugin.json` equals the `package.json` version, and `npm test` fails when they differ. Bump both in the PR that changes the plugin, so synced sessions pick up the change.

## Change process

1. Change the files here in a PR.
2. After merge, paste each changed file into its field on claude.ai/code. The form has no API, so this step is manual.
3. Start a new cloud session and run the checks below.

## Checks for a new session

Ask Claude to run `check-tools`, `node -v` (expect `v24.15` or later), `corepack --version` and `uv --version`. Check that `~/.claude/rules/pstack-models.md` exists. Then run the install step of the repo in the session.

## Repo contract

The environment provides runtimes and root-only OS libraries: Node 24 (24.15 or later), corepack, uv, and Playwright's Chromium system libraries.
Each repo declares every other tool it needs, so its own install step sets it up the same way on a Mac, in CI and in the cloud:

- npm CLIs (`wrangler`, `@shopify/cli`, Playwright): `devDependencies`, pinned in the lockfile.
- pnpm version: the `packageManager` field.
- Python version and packages: `requires-python` and dependencies in `pyproject.toml`, run through `uv`.
- Native binaries (`shfmt`, `shellcheck`, `gitleaks`): an install target that downloads a pinned version and checks its SHA-256.
- Playwright browsers: `playwright install chromium` in the install step.

Do not add a repo tool to [env/setup.sh](env/setup.sh). Fix the repo instead.
The one non-runtime step in `env/setup.sh` is the pstack model rule. The rule belongs to the user, not to a repo, and the setup script is the only step that runs in every session.

## GitHub access

Install the Claude GitHub App on the `catati` org. Every repo below lives there.

## What each repo gets

Cloudflare is the only serverless provider. Firebase is being removed, so this environment does not provide it.

| Repo | Install in a session | Gap against the repo contract | Notes |
|---|---|---|---|
| `catsper` | `make install` | None. `make install` already runs `playwright install chromium`. | No `.git/env` in the cloud, so `configure` reports `web/.env` as missing. `make integration-test` and `make e2e-test` run Firebase emulators, which this environment does not provide. |
| `cat-hotel` | `make install` | None. `@shopify/cli` is a root devDependency (catati/cat-hotel#255), and `make install` runs `pnpm install` and `playwright install chromium` (catati/cat-hotel#223). | `wrangler` is already a devDependency. `shopify app deploy --config dev` needs `SHOPIFY_SERVICE_ACCOUNT_TOKEN`. |
| `agents` | `make tools-install` | None. `make tools-install` installs the pinned `shfmt` and `shellcheck` (catati/agents#570, on `main` via #572). | Python comes from `requires-python` in `tools/product-labels/pyproject.toml`. `make gmail-auth` and `mcp-deploy ENV=prod` are Mac-only. |
| `catati-horizon` | `npm ci` | Fixed on `dev` only (catati/catati-horizon#60): declares `@shopify/cli`, drops `jq`, installs Playwright Chromium. Open until it reaches `main`, the default branch that cloud sessions clone. | `shopify theme dev` needs `SHOPIFY_CLI_THEME_TOKEN`. |
| `branding` | `npm ci`; Python scripts through `uv run` | None. `package.json` pins `wrangler`; `pyproject.toml` declares `fonttools` and `brotli` (catati/branding#5). | |
| `knowledge` | `make install` | None. `make install` runs `gitleaks-install` (catati/knowledge#13). | |

Paste the current [env/setup.sh](env/setup.sh) into the environment form after each merge that changes it. A row with an open gap means that repo's sessions lack the tool until the repo's fix reaches `main`. Set a row's gap to "None" when that fix reaches `main`.

Not reachable from the cloud: `hermes` and `catati-video` (not on GitHub), and `ads`, `products`, `catati-products` (no Git remote).

## Rules for env/.env.example

Treat every committed value as public.

- Non-secret value: commit it in [env/.env.example](env/.env.example).
- Secret value: keep the name with a blank value here; fill the value only in the form.
- A value that identifies a Catati account but grants no access, such as `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL` and `SHOPIFY_SHOP`: keep the name with a blank value here; fill the value only in the form.
- A value that differs per repo does not belong here: commit it in that repo.

## Not covered

- Production deploys: keep production credentials out of this shared environment. `CLOUDFLARE_API_TOKEN` must be an account API token created in the `catati-dev` account, never in the production "Catati" account.
- The `catsper-dev` Worker exists in Cloudflare, but `catsper` `main` has no `wrangler` config yet.
