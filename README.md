# catati/dev

This repo is the Catati dev cloud environment (`catati-dev` on claude.ai/code), as files.
Each field of the environment form has one source here. Change the file, not the form.

| Form field | Source |
|---|---|
| Name | `catati-dev` |
| Network access | Custom: paste [env/network-allowlist.txt](env/network-allowlist.txt), tick "also allow default package managers" |
| Environment variables | Paste [env/.env.example](env/.env.example), then fill the blank values in the form. Dev values only: every user of the environment can read them. |
| Setup script | Paste [env/setup.sh](env/setup.sh) |

## Conventions

`conventions/` holds the rules every Catati repo follows. `templates/` holds the files that `catati-dev setup` and `catati-dev session-start` write.
Each rule names its check. A rule marked `catati-dev check` fails `make verify` when it breaks. A rule marked `catati-dev check-pr` fails the `pr-format` check on the PR. A rule marked `judgment` needs a reviewer.

- [conventions/naming.md](conventions/naming.md) lists the names of repos, resources, make targets, CI checks, files and labels, and the recorded exceptions.
- [conventions/branches.md](conventions/branches.md) covers branches, merges, session start, environments and deploys.
- [conventions/issues-and-prs.md](conventions/issues-and-prs.md) covers `CLAUDE.md`, issues, PR sections and evidence.

## Run `catati-dev check` in `make verify`

`catati-dev check` checks the rules marked `catati-dev check` in `conventions/`.
It checks the whole git repo that holds the current directory, so you can run it from any subdirectory.
It compares the repo with the `templates/` folder of the installed package, so it needs no network.
It prints one line per finding, as `<check>: <path>: <problem>`, and exits with 1 if it finds any. Otherwise it exits with 0.
If it cannot run, for example outside a git repo or on a file it cannot read, it prints one line on stderr and exits with 2.

| Check | Fails when |
| --- | --- |
| `templates-equal` | `.github/ISSUE_TEMPLATE/issue.yml`, `.github/pull_request_template.md` or `.github/workflows/pr-format.yml` is missing or differs by a byte from `templates/`. |
| `make-targets` | The `Makefile` has no `install`, `test`, `e2e`, `verify`, `lint` or `help` target. |
| `ci-workflow` | `.github/workflows/ci.yml` is missing. |
| `env-example` | An env template, such as `example.env` or `.env.sample`, is not named `.env.example`. Real env files, such as `.env` and `.prod.env`, are not templates. |

To install the package, add it as a dev dependency pinned to a commit of this repo:

```sh
pnpm add -D github:catati/dev#<sha>
npm install -D github:catati/dev#<sha>
```

Then call it from the `verify` target:

```make
verify: lint test
	npx catati-dev check
```

Other repos can install the package only when `catati/dev` is public (#15).

To accept a finding for a time, add this line to the file that has the finding:

```text
# catati-dev-allow(<check>): <reason>; expires YYYY-MM-DD
```

The line turns off that check for every finding in the file that holds it, until the end of the date.
It covers the whole file, not one line, because some findings have no line of their own. A missing `Makefile` target is an example.

A file that cannot hold a comment, such as a template or a missing file, takes its line in `.catati-dev-allow` at the repo root, one line per check.
A line in `.catati-dev-allow` turns off its check for the whole repo.

An expired or malformed allow line is a finding with the check `allow`.
A date that does not exist, such as `2026-02-31`, makes the line malformed.

To test the package, run `npm test`.

## Run `catati-dev session-start` at session start

`catati-dev session-start` sets up a session in the git repo that holds the current directory:

1. If the repo has a `.githooks` folder and `core.hooksPath` is unset, it sets `git config core.hooksPath .githooks`. If `core.hooksPath` already names another folder, such as `.husky`, it keeps that value and prints a warning.
2. If `~/.claude/rules/pstack-models.md` is missing, it copies `templates/pstack-models.md` there. It never replaces a rule you already have.
3. It checks that `node` is 24.15 or later. If `package.json` has `packageManager: pnpm@<version>`, it checks that `corepack pnpm --version` prints that version.
   The first run in a repo can download that pnpm version through corepack, about 1.5 s on a cold cache. The download fills the cache the repo's install step needs.
   Each check stops after 3 s, so a session with no network starts with a `timed out` warning instead of a long wait.

Each step reads the current state first, so a second run changes nothing.
It prints one line on stdout per toolchain problem, as `catati-dev: <problem>`, and still exits with 0.
Claude Code adds a SessionStart hook's stdout to the session when the hook exits with 0, so the agent sees the warning and the session starts normally.
Outside a git repo, it prints one line on stderr and exits with 2.

To run it in every session of a repo, add this entry to the repo's `.claude/settings.json`:

```json
{
	"hooks": {
		"SessionStart": [
			{
				"hooks": [{ "type": "command", "command": "cd \"$CLAUDE_PROJECT_DIR\" && node_modules/.bin/catati-dev session-start" }]
			}
		]
	}
}
```

The entry calls the installed binary directly. `npx --no-install catati-dev` asks the npm registry for `catati-dev` when the package is not installed.
A fresh clone has no `node_modules`, so the hook prints `not found` until the repo installs. To set up a fresh clone, also run `node_modules/.bin/catati-dev session-start` as the last step of `make install`.

A session whose primary directory is not a repo runs no repo's SessionStart hook. For those sessions, [env/setup.sh](env/setup.sh) writes the same rule before Claude starts, with the same "only when missing" test. `npm test` fails when the copy in `env/setup.sh` differs from `templates/pstack-models.md`.

## Run `catati-dev setup` to set a repo up to the standard

`catati-dev setup` writes the files every Catati repo carries, in the git repo that holds the current directory.
Run it again at any time to bring the repo up to date. A run on a repo that is already up to date changes nothing.

| File | What `setup` does |
| --- | --- |
| `.github/ISSUE_TEMPLATE/issue.yml` | Copies `templates/issue.yml`. |
| `.github/pull_request_template.md` | Copies `templates/pull_request_template.md`. |
| `.github/workflows/pr-format.yml` | Copies `templates/pr-format.yml`, the workflow that runs `catati-dev check-pr` on each PR. |
| `.github/CODEOWNERS` | Adds each line of `templates/CODEOWNERS` that the file lacks, at the end and in template order. |
| `.githooks/pre-commit`, `.githooks/pre-push` | Copies `templates/githooks/`, and sets the exec bit. |
| `.node-version` | Copies `templates/node-version`, which holds `24`. |
| `.claude/settings.json` | Adds each entry of `templates/claude-settings.json` that the file lacks. The template asks before `gh pr merge` and before the GitHub MCP merge tool. |

It prints one line per file, as `created <path>`, `updated <path>` or `unchanged <path>`.
A copy replaces the whole file when one byte differs, and keeps the file's mode.
The CODEOWNERS merge keeps every line the repo already has, so a repo can add its own owner rules.
The settings merge keeps every key the repo already has, and adds new list entries at the end of the list.
If a merge cannot keep the file's own bytes, it prints `skipped <path>: <reason>` and leaves the file as is.
An example is a file that a JSON rewrite would reformat, or a `permissions.ask` that is not a list.
It also skips a managed path that is not a regular file, such as a symlink.
It skips a managed path whose parent directory, such as `.github`, is a symlink. If the link leads out of the repo, the line reads `skipped <path>: resolves outside the repo`.
A link that stays in the repo is skipped too. Git commits the link, not the files behind it, so the files would land at a path the standard does not name.

After the files, it prints the findings of `catati-dev check`, such as a missing `e2e` target. Those are the changes `setup` does not make.
With `--dry-run`, it prints the same lines and writes nothing. The findings then show what would be left after a real run.
It exits with 0, also when it prints findings. If it cannot run, for example outside a git repo, it prints one line on stderr and exits with 2.
If it skipped a file, its last line goes to stderr, as `catati-dev: setup skipped <n> file(s); the standard is not fully applied`, and it still exits with 0.
A caller such as a skill reads stderr to learn that the repo needs a person to look at the skipped files.

`setup` does not touch the `Makefile`, `ci.yml`, the `catati/dev` pin, `CLAUDE.md`, or the Biome and tsconfig bases.

## Run `catati-dev check-pr` in the `pr-format` workflow

`catati-dev check-pr` checks the title and body of a PR against the rules marked `catati-dev check-pr` in [conventions/issues-and-prs.md](conventions/issues-and-prs.md).
It reads the title from `PR_TITLE`, the body from `PR_BODY` and the author from `PR_ACTOR`.
It takes the section order from `templates/pull_request_template.md` in the installed package, the same file that `templates-equal` keeps in the repo.

| Part | Fails when |
| --- | --- |
| title | The title does not read `<area>: <outcome>`, such as `admin: Warn before an admin change overbooks a room`. |
| body | A heading or the `> [!NOTE]` card of the template is missing or out of order. |
| body | The body has no `Closes #<issue number>`. |
| body | Merge Danger has no ``**Door:** `two-way` `` or ``**Door:** `one-way` ``. |

It prints one line per finding, as `<part>: <problem>`, and exits with 1 if it finds any. Otherwise it exits with 0.
In GitHub Actions, each line starts with `::error::`, so the finding shows on the PR.
A PR whose author ends in `[bot]`, such as `dependabot[bot]`, is skipped with one line and exit 0.
If `PR_TITLE` or `PR_BODY` is unset, it prints one line on stderr and exits with 2.

`setup` copies [templates/pr-format.yml](templates/pr-format.yml) to `.github/workflows/pr-format.yml`. The file is the same in every repo, and its job is named `pr-format`.
The job does not install the repo. It checks out only `package.json` and `.node-version`, reads the `catati-dev` pin from `devDependencies`, and installs that one package into a temporary folder with `npm install`.
The same steps work for pnpm and npm repos, because both write the pin to `package.json` as `github:catati/dev#<sha>`. `catati-dev` has no dependencies, so the install takes about 2 s.
The job fails when the pin is not `github:catati/dev#<full commit SHA>`. A branch or a short SHA could change under the repo.

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
| `cat-hotel` | `pnpm install`, then `make install` | None. `make install` runs `playwright install chromium` (catati/cat-hotel#223). | `wrangler` is already a devDependency. |
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
