# catati/dev

This repo is the Catati dev cloud environment (`catati-dev` on claude.ai/code), as files.
Each field of the environment form has one source here. Change the file, not the form.

| Form field | Source |
|---|---|
| Name | `catati-dev` |
| Network access | Custom: paste [env/network-allowlist.txt](env/network-allowlist.txt), tick "also allow default package managers" |
| Environment variables | Paste [env/.env.example](env/.env.example), then fill the blank secrets in the form. Dev values only: every user of the environment can read them. |
| Setup script | Paste [env/setup.sh](env/setup.sh) |

## Conventions

`conventions/` holds the rules every Catati repo follows. `templates/` holds the files every repo carries unchanged.
Each rule names its check. A rule marked `catati-dev check` fails `make verify` when it breaks. A rule marked `judgment` needs a reviewer.

- [conventions/naming.md](conventions/naming.md) lists the names of repos, resources, make targets, CI checks, files and labels, and the recorded exceptions.
- [conventions/branches.md](conventions/branches.md) covers branches, merges, session start, environments and deploys.
- [conventions/issues-and-prs.md](conventions/issues-and-prs.md) covers `CLAUDE.md`, issues, PR sections and evidence.

## Run `catati-dev check` in `make verify`

`catati-dev check` runs in the repo root and checks the rules marked `catati-dev check` in `conventions/`.
It compares the repo with the `templates/` folder of the installed package, so it needs no network.
It prints one line per finding, as `<check>: <path>: <problem>`, and exits with 1 if it finds any. Otherwise it exits with 0.

| Check | Fails when |
| --- | --- |
| `templates-equal` | `.github/ISSUE_TEMPLATE/issue.yml` or `.github/pull_request_template.md` is missing or differs by a byte from `templates/`. |
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

The line turns off that check for that file until the end of the date. A file that cannot hold a comment, such as a template, takes its line in `.catati-dev-allow` at the repo root, one line per check. There the line turns off the check for the whole repo. An expired or malformed allow line is a finding with the check `allow`.

To test the package, run `npm test`.

## Change process

1. Change the files here in a PR.
2. After merge, paste each changed file into its field on claude.ai/code. The form has no API, so this step is manual.
3. Start a new cloud session and run the checks below.

## Checks for a new session

Ask Claude to run `check-tools`, `node -v` (expect `v24.15` or later), `corepack --version` and `uv --version`. Then run the install step of the repo in the session.

## Repo contract

The environment provides runtimes and root-only OS libraries: Node 24 (24.15 or later), corepack, uv, and Playwright's Chromium system libraries.
Each repo declares every other tool it needs, so its own install step sets it up the same way on a Mac, in CI and in the cloud:

- npm CLIs (`wrangler`, `@shopify/cli`, Playwright): `devDependencies`, pinned in the lockfile.
- pnpm version: the `packageManager` field.
- Python version and packages: `requires-python` and dependencies in `pyproject.toml`, run through `uv`.
- Native binaries (`shfmt`, `shellcheck`, `gitleaks`): an install target that downloads a pinned version and checks its SHA-256.
- Playwright browsers: `playwright install chromium` in the install step.

Do not add a repo tool to [env/setup.sh](env/setup.sh). Fix the repo instead.

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

- Non-secret value: commit it in [env/.env.example](env/.env.example).
- Secret value: keep the name with a blank value here; fill the value only in the form.
- A value that differs per repo does not belong here: commit it in that repo.

## Not covered

- Production deploys: keep production credentials out of this shared environment. `CLOUDFLARE_API_TOKEN` must be an account API token created in the `catati-dev` account, never in the production "Catati" account.
- The `catsper-dev` Worker exists in Cloudflare, but `catsper` `main` has no `wrangler` config yet.
