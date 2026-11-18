# Cloud environment reference

The `dev` environment on claude.ai/code runs every cloud session for Catati repos. Its form has no API, so each field has a source file in [`env/`](../env/). To change a field, follow [Change the cloud environment](../README.md#change-the-cloud-environment).

## The form fields

| Form field | Source |
| --- | --- |
| Name | `dev` |
| Network access | Custom. Paste [`env/network-allowlist.txt`](../env/network-allowlist.txt), and tick "also allow default package managers". |
| Environment variables | Paste [`env/.env.example`](../env/.env.example), then fill the blank values in the form. Use dev values only, because every user of the environment can read them. |
| Setup script | Paste [`env/setup.sh`](../env/setup.sh). |

**Network allowlist.** Never block a Catati domain, Google Fonts, Google Analytics, Cloudflare or Shopify. The allowlist holds each zone in the Cloudflare `Catati` account, as the apex and as `*.`. When a zone is added there, add it to the list and to `catatiZones` in [`test/network-allowlist.test.mjs`](../test/network-allowlist.test.mjs). A project thread can add only exact hosts to the cloud environment. A wildcard needs the operator in Project settings, so the thread gives the operator the whole paste-ready field in one message.

**Setup script.** `env/setup.sh` installs Node 24, enables corepack, checks that uv is present and installs the Playwright system libraries. Before Claude starts, it also writes the pstack model rule to `~/.claude/rules/pstack-models.md` when that file is missing, so a session without the plugin still has the rule. `npm test` fails when the copy in `env/setup.sh` differs from `plugins/catati/rules/pstack-models.md`.

**GitHub access.** Install the Claude GitHub App on the `catati` organization. Every repo in [Repos in the environment](#repos-in-the-environment) lives there.

## What goes in `env/.env.example`

This repo is public, so treat every committed value as public.

| Kind of value | Where it goes |
| --- | --- |
| A value that is not secret | Commit it in `env/.env.example`. |
| A secret | Keep the name with a blank value in `env/.env.example`. Fill the value only in the form. |
| A value that identifies a Catati account but grants no access, such as `CLOUDFLARE_ACCOUNT_ID` | Keep the name with a blank value in `env/.env.example`. Fill the value only in the form. |
| A value that differs per repo | Commit it in that repo, not here. |

> [!WARNING]
> Keep production credentials out of this shared environment. `CLOUDFLARE_API_TOKEN` is the dev user token `catati-dev/all`. Its Account Resources hold only the `catati-dev` account, never the production `Catati` account. It is a user token because the Workers Builds API rejects account tokens (error 12006).

## What the environment provides and what each repo installs

The environment provides only runtimes and the OS libraries that need root: Node 24 (24.15 or later), corepack, uv and the system libraries for Playwright's Chromium.

Each repo declares every other tool it needs. Its own install step then sets the tool up the same way on a Mac, in CI and in the cloud.

| Tool | Where the repo declares it |
| --- | --- |
| npm CLIs, such as `wrangler`, `@shopify/cli` and Playwright | `devDependencies`, pinned in the lockfile. |
| The pnpm version | The `packageManager` field. |
| The Python version and packages | `requires-python` and the dependencies in `pyproject.toml`, run through `uv`. |
| Native binaries, such as `shfmt`, `shellcheck` and `gitleaks` | An install target that downloads a pinned version and checks its SHA-256. |
| Playwright browsers | `playwright install chromium` in the install step. |

Do not add a repo tool to `env/setup.sh`. Fix the repo instead. The one step in `env/setup.sh` that installs no runtime writes the pstack model rule. The rule belongs to the user, not to a repo, and the setup script is the only step that runs in every session.

## Repos in the environment

The environment serves catsper, cat-hotel, terraform and catati/dev. Cloudflare is the only serverless provider. Firebase is being removed, so this environment does not provide it.

| Repo | Install in a session | Notes |
| --- | --- | --- |
| `catsper` | `make install` | `make install` installs the packages and Playwright's Chromium, and switches on the Git hooks. No `.git/env` exists in the cloud, so `make install` reports `web/.env` as missing. Tests run against a local `wrangler dev` with local D1 and R2, with no Firebase. A merge to `main` deploys the two dev Workers, `catsper-api` and `catsper-web`, through Workers Builds. |
| `terraform` | `make install` | `make install` runs `npm ci`, downloads the pinned Terraform into `.tools/bin` and checks its SHA-256, and switches on the Git hooks. A plan needs `CLOUDFLARE_API_TOKEN`, the dev token `catati-dev/all`. Agents may plan and apply `cat-hotel/dev`. Its `CLAUDE.md` lists the prod actions that need the operator. |
| `cat-hotel` | `make install` | `make install` runs `pnpm install` and `playwright install chromium`. `@shopify/cli` is a root devDependency, and `wrangler` is a devDependency of each app. `shopify app deploy --config dev` needs `SHOPIFY_SERVICE_ACCOUNT_TOKEN`. |
| `dev` | None | The CLI uses only Node built-ins. |

Each repo must install every tool it needs through its install step. If a session lacks a tool, fix the repo's install step, and the session gets the tool once that fix reaches `main`.
