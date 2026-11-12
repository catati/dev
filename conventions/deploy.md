# Environments and deploys

Every Catati repo builds, tests and deploys to Cloudflare the same way. Names that carry an environment are in [naming.md](naming.md).

Each rule names its check. `catati check` means `make verify` fails when it breaks. `judgment` means a reviewer checks it.

## Environments

There are two environments, `dev` and `prod`. Each has its own Cloudflare account. The account says the environment, so a resource name never does.

| | `dev` | `prod` |
| --- | --- | --- |
| Cloudflare account | `catati-dev` | `catati-prod` |
| Hosts | `<repo>-<component>.catati-dev.workers.dev` | Subdomains of the repo's prod domain, such as `api.cathotel.nz` |
| Shopify | Store `catati-dev-store`, app `cat-hotel-dev` | Store `3dd4ee` (`catati-nz`), app `cat-hotel-prod` |
| Data | A copy of active prod data, which may be reset | Customer data, restored with D1 Time Travel |
| Workers reach it by | A merge to `main`, through Workers Builds | The operator runs the `deploy-prod` job |
| Terraform reaches it by | A merge to `main` runs `apply-dev` | A merge to `main` runs `apply-prod` |
| Agents may | Plan, apply, deploy, migrate and reset | Read. Write only under the rule in [Who changes prod](#who-changes-prod). |
| Tokens live in | GitHub environment `dev`, and the `catati-dev` cloud environment | GitHub environments `prod` and `plan-prod` |

| Rule | Check |
| --- | --- |
| The only environments are `dev` and `prod`. No `staging` or `preview` environment exists. | `catati check` for Wrangler `env` keys, GitHub environments, Terraform roots and env config file names |
| A PR preview, when added, runs in `dev` on dev data. | judgment |
| The prod account holds prod resources only. | judgment |
| The domain `catati.nz` is held for a dev root domain. | judgment |

## Pipeline

A change moves through a PR, a merge to `main`, then a prod release. Each kind of change has one path. Only the last column changes prod.

| Change | Pull request | Merge to `main` | Prod release |
| --- | --- | --- | --- |
| Worker code or `wrangler.jsonc` | `<package>-verify`, with `wrangler versions upload --dry-run` for both envs | Workers Builds runs `wrangler deploy --env dev` | The operator runs `deploy-prod` |
| D1 migration | The migration, and a test that the live code still works after it | Applied to dev D1 before the dev deploy | `deploy-prod` applies it first |
| Long-lived resource (D1, R2, queue, Turnstile) | `plan-dev` and `plan-prod` in the job summary | `apply-dev`, and `apply-prod` when the prod root changes | The operator's merge |
| Workers Builds trigger | The `builds.json` check | `builds.mjs apply` | None. Prod has no Workers Builds trigger. |
| Secret value | None. A secret never enters a PR. | None | The operator sets it in the dashboard |
| Shopify app config | The `shopify.app.<env>.toml` diff | An agent may run `shopify app deploy --config dev` | The operator runs `--config prod` |

## The `deploy-prod` job

`deploy-prod` is the only way a Worker reaches prod. It is a job in the repo's `deploy.yml`.

| Rule | Check |
| --- | --- |
| `deploy-prod` has only a `workflow_dispatch` trigger. | judgment |
| Its first step fails unless `github.triggering_actor` is the operator, `catati-ops`. | judgment |
| It runs in GitHub environment `prod`, which deploys from `main` only. | judgment |
| It builds each Worker once, applies new prod D1 migrations, then runs `wrangler deploy --env prod` for each Worker, the API before the frontends. | judgment |
| It checks that each prod host answers, and writes the deployed versions and the rollback command to the job summary. | judgment |
| Its token is a `catati-prod` account token with Workers Admin at product level, D1 Edit, and Zone Workers Routes Write on the prod domain. Product level is needed because Cloudflare lets only Workers Admin create a Worker, and Custom Domains have no per-Worker role yet. | judgment |
| No other job deploys Workers in GitHub environment `prod`. Terraform's `apply-prod` also runs there. | judgment |
| Rollback is in the Cloudflare dashboard, so it works when GitHub is down. It restores code only, not routes, domains, crons or queue consumers. To restore those, run `deploy-prod` on the older commit. | judgment |

## Config and secrets

| Rule | Check |
| --- | --- |
| Every `wrangler.jsonc` has `env.dev` and `env.prod`. Each sets `name` and the `account_id` of its account. The top level holds only shared keys. | `catati check`. Which account each `account_id` names, and the top-level keys, need judgment. |
| Every Wrangler command passes `--env`. | `catati check` for remote commands in `package.json` scripts, `Makefile`s and `builds.json`. Workflow steps need judgment. |
| Terraform owns long-lived resources: D1, R2, queues and Turnstile. `wrangler.jsonc` owns Workers, bindings, vars, routes, crons, queue consumers and Workflows. `builds.json` owns Workers Builds triggers, one file per account. The dashboard holds secret values only. | judgment |
| Plain vars live only in `wrangler.jsonc`. No Wrangler command passes `--keep-vars`. | `catati check` for `--keep-vars`. Where plain vars live needs judgment. |
| Each Worker lists its secret names in its deploy doc. A secret value never enters a repo, a log or a PR. | judgment |
| A prod token lives only in GitHub environment `prod` (deploys from `main` only) or `plan-prod` (read-only). Never in a repository secret or a cloud environment. | judgment |
| Each token reaches one account with the fewest permissions. A Workers token names the Workers it may edit, except where Cloudflare needs product scope: to create a Worker or change a Custom Domain. | judgment |

## Migrations

| Rule | Check |
| --- | --- |
| A migration keeps the live version working. Add first, and remove in a later release. | judgment |
| A migration runs before the code that needs it: in the dev deploy, and first in `deploy-prod`. | judgment |
| An applied migration file never changes. A fix is a new migration. | judgment |

## Who changes prod

| Rule | Check |
| --- | --- |
| An agent changes prod only when both gates hold. 1) The operator asks for that specific prod action. 2) It runs on the operator's machine (Remote Control, the local CLIs and logins) or through the operator's connectors, never from a cloud environment, which has no prod access. Without that ask, agents do not change prod. | judgment |
| Where this page says the operator runs or merges something, an agent may do it when both gates hold. | judgment |
| The prod guard hook asks for approval on every prod write, in every session. Prod reads pass with no prompt. | The repo's prod guard hook |
| A merge of a PR that changes a prod Terraform root or `.github/workflows/` is a prod action, because the merge applies prod. | judgment |

## Exceptions

| Name | Rule it breaks | Ends when |
| --- | --- | --- |
| The prod account label `catati` | The prod account is `catati-prod`. | The operator renames the label. |
| `cat-hotel` prod frontends `catati-cat-hotel-*`, their top-level prod config and Workers Builds triggers | `env.prod`; `deploy-prod` is the only path | The `cat-hotel` cutover (#196, #248). |
| `catati-brand-guide` deploys `main` straight to prod | `deploy-prod` is the only path | `brand-guide` adds `deploy-prod`. |
| Catsper and old `cat-hotel` dev resources in the prod account | The prod account holds prod resources only. | They move to `catati-dev` or are deleted. |
