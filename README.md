# catati/dev

This repo is the Catati dev cloud environment (`catati-dev` on claude.ai/code), as files.
Each field of the environment form has one source here. Change the file, not the form.

| Form field | Source |
|---|---|
| Name | `catati-dev` |
| Network access | Custom: paste [network-allowlist.txt](network-allowlist.txt), tick "also allow default package managers" |
| Environment variables | Paste [example.env](example.env), then fill the blank secrets in the form. Dev values only: every user of the environment can read them. |
| Setup script | Paste [setup.sh](setup.sh) |

## Change process

1. Change the files here in a PR.
2. After merge, paste each changed file into its field on claude.ai/code. The form has no API, so this step is manual.
3. Start a new cloud session and run the checks below.

## Checks for a new session

Ask Claude to run `check-tools`, `node -v` (expect `v24.15` or later), `corepack --version` and `uv --version`. Then run the install step of the repo in the session.

## Repo contract

The environment provides runtimes and root-only OS libraries: Node 24, corepack, uv, and Playwright's Chromium system libraries.
Each repo declares every other tool it needs, so its own install step sets it up the same way on a Mac, in CI and in the cloud:

- npm CLIs (`wrangler`, `@shopify/cli`, Playwright): `devDependencies`, pinned in the lockfile.
- pnpm version: the `packageManager` field.
- Python version and packages: `requires-python` and dependencies in `pyproject.toml`, run through `uv`.
- Native binaries (`shfmt`, `shellcheck`, `gitleaks`): an install target that downloads a pinned version and checks its SHA-256.
- Playwright browsers: `playwright install chromium` in the install step.

Do not add a repo tool to [setup.sh](setup.sh). Fix the repo instead.

## GitHub access

Install the Claude GitHub App on the `catati` org. Every repo below lives there.

## What each repo gets

Cloudflare is the only serverless provider. Firebase is being removed, so this environment does not provide it.

| Repo | Install in a session | Gap against the repo contract | Notes |
|---|---|---|---|
| `catsper` | `make install` | Install step does not run `playwright install chromium` (pins `@playwright/test` 1.63.0). | No `.git/env` in the cloud, so `configure` reports `web/.env` as missing. `make integration-test` and `make e2e-test` run Firebase emulators, which this environment does not provide. |
| `cat-hotel` | `pnpm install`, then `make install` | Install step does not run `playwright install chromium` (pins `@playwright/test` 1.62.1). | `wrangler` 4.129.0 is already a devDependency. |
| `agents` | `make tools-install` | `make tools-install` runs only `pnpm install`; it does not install the pinned `shfmt` 3.14.1 and `shellcheck` 0.11.0 that CI downloads. | `make gmail-auth` and `mcp-deploy ENV=prod` are Mac-only. |
| `catati-horizon` | `npm ci` | `@shopify/cli` is not a devDependency; `jq` (used by `scripts/check-theme.sh`) is not declared; install step does not run `playwright install chromium`. | `shopify theme dev` needs `SHOPIFY_CLI_THEME_TOKEN`. |
| `branding` | None yet | No `package.json` for `wrangler`; no `pyproject.toml` for `fonttools` and `brotli` (`scripts/build-fonts.py`). | |
| `knowledge` | `make install` | `make install` does not install the pinned `gitleaks` 8.30.1; `make secrets` skips the scan when it is missing. | |

Until a repo closes its gap, the tools it lacks are not in cloud sessions. Close the gaps before you paste the slim [setup.sh](setup.sh) into the form, or that repo loses those tools in the cloud.

Not reachable from the cloud: `hermes` and `catati-video` (not on GitHub), and `ads`, `products`, `catati-products` (no Git remote).

## Rules for example.env

- Non-secret value: commit it in [example.env](example.env).
- Secret value: keep the name with a blank value here; fill the value only in the form.
- A value that differs per repo does not belong here: commit it in that repo.

## Not covered

- Production deploys: keep production credentials out of this shared environment. `CLOUDFLARE_API_TOKEN` must be scoped to dev resources only.
- The `catsper-dev` Worker exists in Cloudflare, but `catsper` `main` has no `wrangler` config yet.
