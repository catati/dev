# Catati cloud dev environment

One Claude Code cloud environment (claude.ai/code) for all Catati GitHub repos.
The environment is set in the claude.ai UI; this folder holds the values to paste.

## Fields

| Field | Value |
|---|---|
| Name | `catati-dev` |
| Network access | Custom: paste `network-allowlist.txt`, tick "also allow default package managers" |
| Environment variables | None. Do not put secrets here: every user of the environment can read them. |
| Setup script | Paste `setup.sh` |

## GitHub access

Install the Claude GitHub App on both orgs: `catati` (7 repos) and `catati-ops` (`brand-guide`).

## What each repo gets

- `catati-app`: its own SessionStart hook runs `make install`. In the cloud there is no `.git/env`, so `configure` reports `web/.env` as missing. Static checks, unit tests and emulator tests still run. Java 21 is in the image.
- `catati-cat-hotel`, `agents`, `catati-horizon`: run their install target by hand, or add a SessionStart hook gated on `CLAUDE_CODE_REMOTE=true`.
- `hermes`: Docker is in the image, but the containers are not tested in the cloud.
- `ads`, `products`, `catati-products`: no Git remote, so they are not reachable from the cloud.

## Not covered

- Deploys and live Firebase access: these need a service-account key. Use a network secret, not an environment variable, if you add one.
- Shopify (`*.myshopify.com`) and Supabase (`*.supabase.co`): add them to the allowlist only when a task needs them.

## Check the first session

Ask Claude to run `check-tools`, `node -v` (expect `v24`) and `pnpm -v`.
