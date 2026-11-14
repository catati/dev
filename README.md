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

## Conventions

`conventions/` holds what a Catati repo gives pstack: names, repo shape, environments, the verify gate and the guards. `templates/` holds the files that `catati setup` writes.
Each rule names its check. A rule marked `catati check` fails `make verify` when it breaks. A rule marked `judgment` needs a reviewer.

- [conventions/naming.md](conventions/naming.md) lists the names of repos, resources, make targets, CI checks, files and labels, and the recorded exceptions.
- [conventions/branches.md](conventions/branches.md) covers branches and session start.
- [conventions/deploy.md](conventions/deploy.md) covers the `dev` and `prod` environments, the deploy pipeline, the `deploy-prod` job, config, secrets and migrations.
- [conventions/issues-and-prs.md](conventions/issues-and-prs.md) covers `CLAUDE.md`, issues and the verify gates.
- [conventions/ci.md](conventions/ci.md) covers the `changes` job that runs only the CI jobs a diff affects, and how to gate them.
- [conventions/testing.md](conventions/testing.md) maps the unit, integration and e2e layers to make targets, and lists what only production exercises.

## Run `catati check` in `make verify`

`catati check` checks the rules marked `catati check` in `conventions/`.
It checks the whole git repo that holds the current directory, so you can run it from any subdirectory.
It compares the repo with the `templates/` folder of the installed package, so it needs no network.
It prints one line per finding, as `<check>: <path>: <problem>`, and exits with 1 if it finds any. Otherwise it exits with 0.
If it cannot run, for example outside a git repo or on a file it cannot read, it prints one line on stderr and exits with 2.

| Check | Fails when |
| --- | --- |
| `templates-equal` | `.github/ISSUE_TEMPLATE/issue.yml` is missing or differs by a byte from `templates/`. |
| `make-targets` | The `Makefile` has no `install`, `test`, `e2e`, `verify`, `lint` or `help` target, or no `deploy-dev` target in a repo with a `wrangler.jsonc`. |
| `ci-workflow` | `.github/workflows/ci.yml` is missing. |
| `workflow-names` | A `.yml` or `.yaml` file in `.github/workflows/` is not `ci.yml` or `deploy.yml`. Other files there, such as a `README.md`, are not workflows, and no check reads them. |
| `env-names` | A `wrangler.jsonc` has an `env` key other than `dev` or `prod`, a workflow's `environment` is not `dev` or `prod` and does not end in `-dev` or `-prod` (a matrix list is skipped), or an environment word (`production`, `development`, `staging` or `preview`, in any case) names a config file or a Terraform root outside `node_modules/`. A config file is `<base>.<word>.<toml|json|jsonc|yaml|yml>`, such as `shopify.app.production.toml`, `.env.<word>` or `.dev.vars.<word>`. A Terraform root is a folder named `<word>` that directly holds a `.tf` file. Other paths, such as `link-preview.vue` or `production-plans.json`, pass. |
| `secret-names` | A workflow reads `secrets.<NAME>` where a `_` token of the name is `DEV`, `PROD`, `PRODUCTION`, `DEVELOPMENT`, `STAGING` or `CATATI`. |
| `wrangler-envs` | A `wrangler.jsonc` lacks `env.dev` or `env.prod`, each with a string `name` and `account_id`. Or a command in a `package.json` script, a `Makefile` or the `deploy_command` and `build_command` of a `builds.json` runs a remote Wrangler command (`deploy`, `versions`, `d1 migrations apply`, `d1 execute --remote`, `secret`, `triggers`, `rollback`) without `--env` or `-e`. A command with an argument that is only a variable the check cannot expand, such as `$$ENV_ARGS`, is skipped, because that variable may hold `--env`. A variable given as the value of a Wrangler flag, such as `--name ${X}`, does not skip the command. Any command that passes `--keep-vars` is also a finding. In a `Makefile` it reads only recipe lines, never comments, and skips `echo` and `printf` commands. It expands `$(NAME)` and `${NAME}` from `=`, `:=`, `?=` and `+=` variable lines, and reads commands inside `(` and `)`. It splits commands at `&&`, `\|\|`, `;` and `\|` without reading quotes, so a separator inside a quoted string splits there too. |
| `resource-names` | A resource name in a `wrangler.jsonc`, at the top level or in an `env.<name>`, is not `<repo>` or `<repo>-<component>`, or ends in `-dev`, `-prod`, `-production`, `-development` or `-staging`. `<repo>` is the last part of the `origin` remote URL, without `.git`. A repo with no `origin` remote skips this check. Resource names are `name`, `d1_databases[].database_name`, `r2_buckets[].bucket_name`, `queues.producers[].queue`, `queues.consumers[].queue` and `dead_letter_queue`, and `workflows[].name`. No other key is read, so `vars`, `ratelimits`, `send_email` and `durable_objects` bindings pass. |
| `env-example` | An env template, such as `example.env` or `.env.sample`, is not named `.env.example`. Real env files, such as `.env` and `.prod.env`, are not templates. |

To install the package, add it as a dev dependency pinned to a commit of this repo:

```sh
pnpm add -D 'git+https://github.com/catati/dev.git#<sha>'
npm install -D 'git+https://github.com/catati/dev.git#<sha>'
```

The package is `@catati/dev`, so the pin sits in `devDependencies` under the key `"@catati/dev"`, and its command is `catati`.
A repo pinned before the package took this name keeps working on its old pin, catsper included. To move it to the new name, re-pin it with `/catati:repo-setup`.

Then call it from the `verify` target:

```make
verify: lint test
	npx catati check
```

Other repos can install the package only when `catati/dev` is public (#15).

To accept a finding for a time, add this line to the file that has the finding:

```text
# catati-allow(<check>): <reason>; expires YYYY-MM-DD
```

The line turns off that check for every finding in the file that holds it, until the end of the date.
It covers the whole file, not one line, because some findings have no line of their own. A missing `Makefile` target is an example.

A JSON file holds the line as a string value, such as `"//": "catati-allow(<check>): <reason>; expires YYYY-MM-DD"` in `package.json`.

A file that cannot hold a comment or a string, such as a template or a missing file, takes its line in `.catati-allow` at the repo root, one line per check.
A line in `.catati-allow` turns off its check for the whole repo.

An expired or malformed allow line is a finding with the check `allow`.
A date that does not exist, such as `2026-02-31`, makes the line malformed.

To test the package, run `npm test`.
The `verify` check in [.github/workflows/ci.yml](.github/workflows/ci.yml) runs `npm test` on every PR and on each push to `main`.

## Run `catati session-start` at session start

`catati session-start` sets up a session in the git repo that holds the current directory:

1. If the repo has a `.githooks` folder and `core.hooksPath` is unset, it sets `git config core.hooksPath .githooks`. If `core.hooksPath` already names another folder, such as `.husky`, it keeps that value and prints a warning.
2. If `~/.claude/rules/pstack-models.md` is missing, it copies `plugins/catati/rules/pstack-models.md` there. It never replaces a rule you already have.
3. It checks that `node` is 24.15 or later. If `package.json` has `packageManager: pnpm@<version>`, it checks that `corepack pnpm --version` prints that version.
   The first run in a repo can download that pnpm version through corepack, about 1.5 s on a cold cache. The download fills the cache the repo's install step needs.
   Each check stops after 3 s, so a session with no network starts with a `timed out` warning instead of a long wait.

Each step reads the current state first, so a second run changes nothing.
It prints one line on stdout per toolchain problem, as `catati: <problem>`, and still exits with 0.
Claude Code adds a SessionStart hook's stdout to the session when the hook exits with 0, so the agent sees the warning and the session starts normally.
Outside a git repo, it prints one line on stderr and exits with 2.

To run it in every session of a repo, add this entry to the repo's `.claude/settings.json`:

```json
{
	"hooks": {
		"SessionStart": [
			{
				"hooks": [{ "type": "command", "command": "cd \"$CLAUDE_PROJECT_DIR\" && node_modules/.bin/catati session-start" }]
			}
		]
	}
}
```

The entry calls the installed binary directly. `npx --no-install catati` asks the npm registry for `catati` when the package is not installed.
A fresh clone has no `node_modules`, so the hook prints `not found` until the repo installs. To set up a fresh clone, also run `node_modules/.bin/catati session-start` as the last step of `make install`.

A session whose primary directory is not a repo runs no repo's SessionStart hook. For those sessions, [env/setup.sh](env/setup.sh) writes the same rule before Claude starts, with the same "only when missing" test. `npm test` fails when the copy in `env/setup.sh` differs from `plugins/catati/rules/pstack-models.md`.

The `catati` plugin runs steps 1 and 2 in every session, so a repo needs no SessionStart entry of its own (see [Use the `catati` plugin](#use-the-catati-plugin)).

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

`setup` does not touch the `Makefile`, `ci.yml`, `.github/CODEOWNERS`, the `catati/dev` pin, `CLAUDE.md`, or the Biome and tsconfig bases.
It neither writes nor removes a repo's `.github/CODEOWNERS`. No ruleset asks for code-owner review, so the file enforces nothing, and `catati check-merge` already lists those paths as doors.

catati/dev runs its own standard. `make verify` runs `npm test` and then `catati check` on catati/dev, and CI's `verify` job runs `make verify`.

## Run `catati check-merge` to list one-way-door paths

`catati check-merge <base> <head>` reports whether the diff touches a one-way-door path.
It lists the files that `git diff <base>...<head>` changes, in the git repo that holds the current directory, and matches each one against the list below.
A rename counts as a delete and an add, so a file that moves into or out of a door path is a match.
A `<dir>/**` entry also matches the bare `<dir>`.
Every entry ignores letter case. Catati deploys from macOS, where APFS reads `PACKAGE.JSON` as `package.json`, so `MAKEFILE`, `PACKAGE.JSON` and `.GITHUB/x` are matches.

Any symlink or submodule (gitlink) that the diff adds, changes or removes is a match, whatever its path, and so is a file that becomes a symlink or a symlink that becomes a file.
A link can point a plain path at a door file or directory, such as `.claude` at a folder that holds `settings.json`, or `other/sub2` at `../sub`, so no path list can catch it.

Git config cannot hide a change from the gate. The gate's git calls skip the system and global config and drop config passed in `GIT_CONFIG_PARAMETERS` or `GIT_CONFIG_COUNT`. They also ignore replace refs and `.git/info/grafts`, which could swap the head tree or move the merge base.
The repo's own `.git/config` still applies, so the diff itself sets every option that config could change: `--ignore-submodules=none` (over `diff.ignoreSubmodules`, `submodule.<name>.ignore` and `ignore = all` in `.gitmodules`), `--no-renames`, `--no-abbrev`, `--no-relative` and `-z`.

| Path | Why it is a one-way door |
| --- | --- |
| `.github/**` | CI, required checks, branch protection, CODEOWNERS, composite actions and Dependabot. |
| `.claude/settings.json` | The permission prompts and sandbox rules of every session in the repo. |
| `.githooks/**` | Git hooks run on every developer machine and can skip the local guards. |
| `.claude/hooks/**` | Claude Code hooks run on every session. |
| `plugins/*/hooks/**` | A plugin's Claude Code hooks, the prod guard among them, run in every session that syncs the plugin. |
| `.gitmodules` | Where each submodule is fetched from. |
| `**/.npmrc` | The registry that installs, deploys included, fetch packages from. |
| `env/setup.sh` | The setup script of every cloud session. |
| `**/package.json` | Deploy and release scripts live in `scripts`. In catati/dev, `bin` also names the gate's entry point. A version bump and a `@catati/dev` re-pin are not matches, as below. |
| `**/Makefile`, `**/GNUmakefile`, `**/*.mk` | Deploy targets. A variable or an `include` can change one without touching its lines, so any change counts. |
| `**/Dockerfile`, `**/Dockerfile.*`, `**/*.Dockerfile`, `**/Containerfile`, `**/Containerfile.*`, `**/*.Containerfile`, `**/compose*.yml`, `**/compose*.yaml`, `**/docker-compose*` | What the deployed containers run. |
| `**/wrangler.toml`, `**/wrangler.json`, `**/wrangler.jsonc`, `**/shopify.app*.toml`, `firebase.json`, `.firebaserc` | Deploy config and the projects it targets. `firebase.json` and `.firebaserc` count only at the root, where the Firebase CLI reads them. |
| `firestore.rules`, `storage.rules`, `firestore.indexes.json` | The access rules and indexes of live data. These count only at the root, so a `firestore.rules` in a subfolder is not a match. |
| `**/migrations/**` | Data migrations. |
| `templates/githooks/**` | `catati setup` copies these into the Git hooks of every repo. |
| `bin/catati.mjs`, `lib/check-merge.mjs`, `lib/repo.mjs` | The gate and every module it loads. It must not be able to pass a change to its own code. A test follows the `check-merge` entry of the command table and fails when it loads a module outside this list, or when any module it loads has an `import()` whose target is not a literal. |

A changed path that holds a control character (U+0000 to U+001F or U+007F) or a line or paragraph separator (U+2028, U+2029) is a match whatever its name. No real file needs such a name, and the gate cannot be sure what a tool downstream makes of it. The gate prints that path with each such character as `\uXXXX`.

Lockfiles are not doors. CI checks a dependency bump, and a door on every lockfile would send every bump to the operator.

Two routine `package.json` changes are not doors either, for the same reason. The gate parses both sides of the file as JSON and compares them with the exempt fields removed. It never reads diff lines.

- A diff that changes only the top-level `version`. Each shipping PR bumps the version, so a door on it would send nearly every PR to the operator.
- A diff that changes only the `@catati/dev` entry in `dependencies` or `devDependencies`, with or without a `version` change, when the new value is `git+https://github.com/catati/dev.git#<40-hex sha>` and that commit is on catati/dev `main`. The code a re-pin pulls in was reviewed and merged here, and catati/dev sends its own door paths to the operator.

The gate confirms the commit with a treeless clone of `main` from `https://github.com/catati/dev.git`, in a new temporary folder and with the same git config as its other calls, so no repo, user or environment config can point the clone elsewhere. It honours `HTTPS_PROXY` and `GIT_SSL_CAINFO`, as a cloud session needs. A pin it cannot confirm stays a match. When the clone fails, the gate prints `catati: check-merge: cannot fetch main from https://github.com/catati/dev.git, so a @catati/dev pin move stays a door` on stderr and counts the file as a match.

Anything else in a `package.json` stays a match: a file that is added, deleted or changes mode, a side that does not parse, any other change (key order included), a pin in another form or section, and a file whose text says more than `JSON.parse` reads, such as a duplicate or escaped key, which another reader could take differently.

It prints one line per match, as `one-way-door: <path>`, and exits with 1. A symlink adds ` (symlink)` and a submodule adds ` (submodule)` to its line, and a door path that is also a link prints once. With no match, it prints `check-merge: no one-way-door path` and exits with 0.
With a wrong number of arguments, a base or head that is not a commit, or a run outside a git repo, it prints one line on stderr and exits with 2.
A failed git call or diff output it cannot parse also exits with 2. That covers only output git prints. An entry that git leaves out is unseen, which is why the gate sets the config that decides what git prints.

A pull request that matches, or whose merge changes production, is the operator's to merge, after a non-author verifier PASS at its head commit and green CI (see [deploy.md](conventions/deploy.md) for who changes prod). Every other pull request is merged by the session that owns it once those gates pass.

The one-way-door rule also names "anything touching production". No path list can prove that a change leaves production alone. Exit 0 means only that no listed path changed.
A deploy script that a `Makefile` target calls, such as `scripts/deploy.sh`, is an example of a change the list does not see.

Run the gate from the base branch's copy of `@catati/dev`, never from the PR head. The head's copy is the code under review, so a PR could edit it to pass itself.

## Use the `catati` plugin

This repo is also a Claude Code plugin marketplace, `.claude-plugin/marketplace.json`, with one plugin, `catati`, in `plugins/catati/`.
The plugin sits in a subfolder because claude.ai rejects a plugin with a top-level `bin/`, and this repo has one.

The operator adds the marketplace at account level on claude.ai. Account plugins sync into sessions started from the app, not into sessions started through the sessions API (#25).
A synced plugin holds only its own folder, so the skill cannot run the repo's `bin/`. It installs the package into the target repo instead.

| Part | What it does |
| --- | --- |
| `/catati:repo-setup` | Pins `@catati/dev` in the target repo at the head of `main`, runs `catati setup`, adds the `CLAUDE.md` conventions link and the rule table, then opens one PR per pstack's Opening a PR. Run it again after each `catati/dev` release. |
| SessionStart hook `probe.sh` | Writes `~/.claude/catati-plugin-hook-ran`. It is a probe, and does nothing else. |
| SessionStart hook `session-start.mjs` | Runs steps 1 and 2 of `catati session-start` for each repo of the session: the repo that holds `CLAUDE_PROJECT_DIR` (or the cwd), or else each repo directly below it, as in a project thread that starts in `/home/user`. It prints a line only for a problem. |
| WorktreeCreate and WorktreeRemove hook `worktree.mjs` | Makes `Agent` with `isolation: "worktree"` work where the session starts above the repos. In a repo it adds a locked worktree at `<toplevel>/.claude/worktrees/<name>` on branch `worktree-<name>`, as Claude Code does. In a folder that is no repo, such as `/home/user` in a project thread, it makes `<cwd>/.claude/worktrees/<name>/` with one locked worktree per repo directly below, at the same relative paths. Each worktree starts at its repo's `HEAD`, not `origin/HEAD`, so a subagent sees the root's unpushed work. Each branch records `catatiBase` and gets `pushRemote=no-push`. Remove deletes a clean worktree on its own `worktree-<name>` branch, and that branch when it has no commits beyond `catatiBase`. It keeps, locked, a worktree that is dirty (an untracked nested repo or worktree counts), holds another worktree of its repo, or is on another branch, and exits 1. |
| PreToolUse hook `pre-tool-use.mjs` | Runs the prod guard (`guard-prod.mjs`) and the ask rules (`ask-rules.mjs`) on `Bash`, the file-edit tools, `mcp__cloudflare__execute`, the Shopify connector, the GitHub merge tools and `mcp__github__actions_run_trigger`, and returns one decision: deny over ask over pass. When either check throws, it asks, because Claude Code lets a call run when a hook fails. |

A `WorktreeCreate` hook replaces Claude Code's own `git worktree` logic in every session, local ones included, and Claude Code then skips `.worktreeinclude`. Claude Code does not call `WorktreeRemove` when a subagent ends, because it cannot tell whether a hook-made worktree holds changes. So the root cleans up: merge each subagent's branch with `git -C <repo> merge --ff-only worktree-<name>` (or cherry-pick when two ran in parallel), then run `node "$(ls -t $(find ~/.claude/plugins -path '*/catati/hooks/worktree.mjs') | head -1)" remove <worktree path>`. Remove refuses any path that is not a `…/worktrees/<name>` folder. Like `git worktree remove`, it deletes ignored files (such as `.env` or `.dev.vars`) in a worktree it counts as clean. Subagents commit and never push; only the root pushes. A worktree has no `node_modules`, so a subagent that runs tests runs `make install` first. `pushRemote=no-push` stops a bare `git push` only, not `git push origin <ref>`.

Repo `.claude/settings.json` files load only when a session starts in that repo, so a project thread that starts one folder up never runs them ([settings](https://code.claude.com/docs/en/settings#settings-files)). Plugin hooks load in every session that syncs the plugin ([hooks](https://code.claude.com/docs/en/hooks)). That is why the guards live here, not in each repo.

`guard-prod.mjs` asks for approval on every prod write and gates merges on a verifier record; cat-hotel `CLAUDE.md` states its rules. It fails closed: when it cannot prove a call is a read, it asks. It decodes `$'…'` words as bash does and asks on an escape it cannot decode, such as a NUL. It reads a command inside `$(…)`, backticks, `bash -c` with any flags before the `c`, `watch`, `eval` and the common prefix wrappers, also when a wrapper is given by its full path or packs a value flag into a cluster such as `sudo -Eu root`. It reads the text a shell, `source`, `.` or `at` runs from a pipe, `-s`, `/dev/stdin`, a here-string, a heredoc or a `<(…)` it is given, and the strings inside `python`, `node`, `perl`, `ruby`, `php` and `deno` code. It judges every word run after wrappers such as `xargs`, `doas`, `su`, `ssh`, `docker`, `kubectl`, `find`, `tmux`, `screen`, `flock`, `setsid`, `strace`, `trap` and `coproc` as a possible command. A program word whose last path part holds `$`, a backtick, a glob or a brace asks, because the guard cannot tell what runs. So does a program word with an unquoted `$` or backtick anywhere, because the shell may split it into more words, unless that `$` is only `HOME`, `PWD`, `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT` or `TMPDIR`; `$HOME/bin/uv` and `"$(git rev-parse --show-toplevel)"/x.sh` are judged by their last path part. After a wrapper or in text fed to a shell, such a word asks only when the rest of the command names prod, such as `deploy-prod`, `--env prod` or `dispatches`. Text piped into `xargs` is judged with the command `xargs` runs. It skips a runner's `-w`/`--workspace`, `--filter`, `--prefix` and `-C` values to find the program, and reads `node`, `bun` or `deno` running a Wrangler entry file such as `wrangler.js` or `wrangler-dist/cli.js` as Wrangler. A Wrangler command asks when any `--env` names something other than `dev`, or when `CLOUDFLARE_ACCOUNT_ID`, set on the command or by an earlier `export`, names another account. A read flag such as `--dry-run` or `--local` counts only when no `false` or `0` follows it. Before judging a Wrangler subcommand it reads each flag it does not know both as a switch and as taking a value. A prod `wrangler d1 execute` passes only with one `--command` that is printable ASCII, starts with `SELECT`, `WITH` or `EXPLAIN`, and holds no `;`, no backslash, no SQL comment and no write, pragma or transaction keyword. On Catati, or with no known account, a `mcp__cloudflare__execute` call passes only when every `method` in its code is a literal `'GET'`, each `cloudflare.request` call opens with one (`cloudflare.request({ method: 'GET', … })`), and the code has no computed key, spread, escape, non-ASCII character or API that can build a method, such as `Object`, `Request` or `parse`; a write on Catati always asks, whatever resource it names. On `catati-dev` a write passes only when each `path` is a literal or a template whose only filled-in part is `${accountId}`, under `/accounts/${accountId}/` or `/accounts/<catati-dev id>/`; any other root, such as `/zones` or `/memberships`, asks. Starting, rerunning, approving, cancelling or deleting a GitHub Actions run, and any other Actions REST write, asks, through `mcp__github__actions_run_trigger`, `gh workflow run`, `gh run rerun`, `gh run cancel`, `gh run delete`, a `gh alias set`, or a `gh api`, `curl`, `wget` or HTTPie write to a `dispatches`, `actions/` or check-suite or check-run `rerequest` path under `repos/<owner>/<repo>` or `repositories/<id>`. A write to an `api.github.com` path with any percent-encoding asks, and so does a GraphQL mutation with any field name, outside strings and comments, that names a rerequest, dispatch, workflow, deployment, approval or rerun. It allows one reviewed prod read: the overbooked nights report call whose SQL has the sha256 `OVERBOOKED_NIGHTS_SQL_SHA256`. cat-hotel's report script holds the same pin, and a cat-hotel tooling test fails unless both pins equal the sha256 of the committed SQL. So a change to the SQL needs a new pin here first, then the same pin and a re-pin of `@catati/dev` in cat-hotel.

`ask-rules.mjs` holds `ASK_RULES`, in the syntax of `permissions.ask` in `settings.json`. A `Bash(...)` rule matches the whole command, any segment of it, and any command inside `$(…)` or backticks, with `*` matching any text. Before matching a segment it drops leading `NAME=value` assignments, the keywords `do`, `then`, `else`, `elif`, `if`, `while`, `until`, `!` and `{`, and the wrappers `timeout`, `time`, `nice`, `nohup`, `stdbuf`, `command`, `builtin`, `noglob` and `xargs` with their options, as Claude Code's own permission rules do ([permissions](https://code.claude.com/docs/en/permissions)). An `Edit(...)` rule covers `Edit`, `MultiEdit`, `Write` and `NotebookEdit`: `/.claude/settings.json` matches that file in any folder, and `~/` is the home folder.

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
