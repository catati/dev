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

Ask Claude to run `check-tools`, `node -v` (expect `v24.15` or later), `pnpm -v`, `wrangler --version`, `shopify version`, `shfmt --version`, `shellcheck --version` and `gitleaks version`.

## GitHub access

Install the Claude GitHub App on the `catati` org. Every repo below lives there.

## What each repo gets

Cloudflare is the only serverless provider. Firebase is being removed, so this environment does not provide it.

| Repo | Install in a session | Notes |
|---|---|---|
| `catsper` | `make install` | No `.git/env` in the cloud, so `configure` reports `web/.env` as missing. `make integration-test` and `make e2e-test` run Firebase emulators, which this environment does not provide. |
| `cat-hotel` | `corepack pnpm@10.30.3 install`, then `make install` | Its SessionStart hook sets up models and Git hooks only. `wrangler` is a devDependency. |
| `agents` | `make tools-install` | `make test` needs the pinned `shfmt` and `shellcheck`. `make gmail-auth` and `mcp-deploy ENV=prod` are Mac-only. |
| `catati-horizon` | `npm ci` | `shopify theme dev` needs `SHOPIFY_CLI_THEME_TOKEN`. |
| `branding` | Nothing | `wrangler dev` serves it; `scripts/build-fonts.py` uses `fonttools`. |
| `knowledge` | `make install` | `make verify` runs the pinned `gitleaks` secret scan. |

Not reachable from the cloud: `hermes` and `catati-video` (not on GitHub), and `ads`, `products`, `catati-products` (no Git remote).

## Rules for example.env

- Non-secret value: commit it in [example.env](example.env).
- Secret value: keep the name with a blank value here; fill the value only in the form.
- A value that differs per repo does not belong here: commit it in that repo.

## Not covered

- Production deploys: keep production credentials out of this shared environment. `CLOUDFLARE_API_TOKEN` must be scoped to dev resources only.
- The `catsper-dev` Worker exists in Cloudflare, but `catsper` `main` has no `wrangler` config yet.
