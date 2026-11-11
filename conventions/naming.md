# Naming

These names apply to every Catati repo. The Exceptions section lists the names that stay as they are for now.

## Repos and resources

| Rule | Example | Check |
| --- | --- | --- |
| The repo name is the stem of every name the repo owns. | Repo `cat-hotel` has the stem `cat-hotel`. | judgment |
| A resource name is `<repo>-<component>`. | The admin Worker of `cat-hotel` is `cat-hotel-admin`. | judgment |
| A resource name has no environment suffix. | Dev and prod both use `cat-hotel-admin`, never `cat-hotel-admin-dev`. | judgment |
| A Cloudflare account is `catati-<env>`. | `catati-dev`, `catati-prod` | judgment |
| Where one namespace holds both environments, a name is `<repo>-<env>`. | Shopify apps `cat-hotel-dev` and `cat-hotel-prod` | judgment |
| Prod hosts are `<component>.<prod domain>`, with the landing site on the apex. Dev hosts are the `workers.dev` names. | `api.cathotel.nz`, `cathotel.nz` | judgment |

## Environments

| Rule | Example | Check |
| --- | --- | --- |
| The only environment names are `dev` and `prod`. This covers Wrangler `env` keys, Terraform roots, GitHub environments, `ENVIRONMENT` values and file names. | `env.prod`, `cat-hotel/prod`, `shopify.app.prod.toml` | judgment |
| A name that carries an environment ends in it, after `-`, or after `:` in a package script. | `deploy-dev`, `deploy:dev`, `plan-prod` | judgment |
| A secret is named for what it holds, the same in every GitHub environment. | `CLOUDFLARE_API_TOKEN` in `dev` and in `prod`, never `CATATI_API_TOKEN` | judgment |

## Make targets

| Rule | Example | Check |
| --- | --- | --- |
| The Makefile has the targets `install`, `test`, `e2e`, `verify`, `lint` and `help`. | `make e2e`, not `make e2e-test`. | `catati check` |
| The Makefile has the targets `dev` and `deploy-dev`. | `make deploy-dev` deploys to the dev account. | judgment |
| A make target or package script that acts on one environment ends in it. A script that checks both has no environment in its name. | `make deploy-dev`, `pnpm deploy:dev`, `check:env` | judgment |
| `make verify` runs `catati check`. | `make verify` fails when `.github/ISSUE_TEMPLATE/issue.yml` differs from `templates/`. | judgment |

## CI workflows and checks

| Rule | Example | Check |
| --- | --- | --- |
| The CI workflow file is `.github/workflows/ci.yml`. | `ci.yml`, not `checks.yml`. | `catati check` |
| The deploy workflow file is `.github/workflows/deploy.yml`. | `deploy.yml`, not `deploy-firebase.yml`. | judgment |
| A deploy job is `<action>-<env>`. | `plan-dev`, `apply-prod`, `deploy-prod` | judgment |
| CI has one check named `verify`. | `agents` reports one `verify` check. | judgment |
| A monorepo has one check per package, named `<package>-verify`. | The `cat-hotel` admin check is `admin-verify`, not `admin/verify`. | judgment |
| The job that maps the diff to package jobs has the id and check name `changes`. See [ci.md](ci.md). | `needs: changes`, not `needs: paths`. | judgment |

## Files and folders

| Rule | Example | Check |
| --- | --- | --- |
| An env template is named `.env.example`. | `admin/.env.example` | `catati check` |
| Docs live in `docs/adr`, `docs/agents`, `docs/research` and `docs/evidence`. | An architecture decision goes in `docs/adr/`. | judgment |

## Shared package

| Rule | Example | Check |
| --- | --- | --- |
| A repo gets shared code as one dev dependency named `@catati/dev`, pinned in the lockfile. | `"@catati/dev"` in `devDependencies`, with its version fixed in the lockfile. | judgment |
| Code moves into `catati/dev` only when two or more repos need it unchanged. | A script that one repo uses stays in that repo. | judgment |
| `catati/dev` has no reusable workflow, bot or sync job. | A repo runs `npx catati check` from its own `ci.yml`. | judgment |

## Titles and labels

| Rule | Example | Check |
| --- | --- | --- |
| An issue title is `<area>: <outcome>`. PR titles follow pstack. | `conventions: Write the shared naming, branch and PR rules` | judgment |
| The status labels are `todo`, `doing`, `review` and `blocked`. | `doing`, not `in-progress`. | judgment |

## Exceptions

| Name | Rule it breaks | Ends when |
| --- | --- | --- |
| Firebase projects `catati-app` and `catati-cat-hotel*` | `<repo>-<component>` | Firebase is removed. |
| `agents/.prod.env` | `.env.example` | No end date. |
| Repo `catati-horizon` | The repo name is the stem. | The Horizon spike reports. |
| Shopify stores `catati-dev-store` and `3dd4ee` | `<repo>-<env>` | No end date. Shopify fixes store domains. |
| `cat-hotel` prod Workers `catati-cat-hotel-*` | `<repo>-<component>` | The `cat-hotel` frontend rename (#248). |
| `cat-hotel` `shopify.app.production.toml`, Shopify apps `catati-cat-hotel-dev` and `catati-cat-hotel`, script `check:dev-env` | `dev` and `prod` only; `<repo>-<env>` | `cat-hotel` renames them. |
| `terraform` workflows `plan.yml`, `apply-dev.yml` and `apply-prod.yml`, GitHub environment `prod-plan`, checks `cat-hotel-dev/plan` and secret `CATATI_API_TOKEN` | `ci.yml` and `deploy.yml`; env last; secret names | `terraform` renames them. |
| `cat-hotel` admin host `admin.catati.co.nz` | Prod hosts are `<component>.<prod domain>`. | Admin moves to `admin.cathotel.nz` at the cutover. |
| Turnstile widget `cat-hotel booking` | `<repo>-<component>` | `terraform` renames it to `cat-hotel-landing`. |
| `terraform` Workers Builds triggers "Deploy main to dev", and checks `cat-hotel-dev/apply`, `cat-hotel-prod/plan` and `cat-hotel-prod/apply` | A deploy job is `<action>-<env>`. | `terraform` renames them. |
| GitHub environments `development` in `cat-hotel` and `catsper`, and `production` in `catsper` | `dev` and `prod` only | Each repo renames it. |
| Catsper stem `catati-catsper` | The repo name is the stem. | Catsper renames its resources. |
| `cat-hotel` CI checks `<package>/verify` and `tooling/changes` | `<package>-verify`; `changes` | `cat-hotel` renames its checks and its required-check list. |
