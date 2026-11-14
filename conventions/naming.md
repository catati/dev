# Naming

These names apply to every Catati repo. The Exceptions section lists the names that stay as they are for now.

## Repos and resources

| Rule | Example | Check |
| --- | --- | --- |
| The repo name is the stem of every name the repo owns. | Repo `cat-hotel` has the stem `cat-hotel`. | judgment |
| A resource name is `<repo>-<component>`. | The admin Worker of `cat-hotel` is `cat-hotel-admin`. | `catati check` for `wrangler.jsonc`. Other resources need judgment. |
| A resource name has no environment suffix. | Dev and prod both use `cat-hotel-admin`, never `cat-hotel-admin-dev`. | `catati check` for `wrangler.jsonc`. Other resources need judgment. |
| A Cloudflare account is `catati-<env>`. | `catati-dev`, `catati-prod` | judgment |
| Where one namespace holds both environments, a name is `<repo>-<env>`. | Shopify apps `cat-hotel-dev` and `cat-hotel-prod` | judgment |
| Prod hosts are `<component>.<prod domain>`, with the landing site on the apex. Dev hosts are the `workers.dev` names. | `api.cathotel.nz`, `cathotel.nz` | judgment |

## Environments

| Rule | Example | Check |
| --- | --- | --- |
| The only environment names are `dev` and `prod`. This covers Wrangler `env` keys, Terraform roots, GitHub environments, `ENVIRONMENT` values and file names. | `env.prod`, `cat-hotel/prod`, `shopify.app.prod.toml` | `catati check` for Wrangler `env` keys, GitHub environments, Terraform roots and env config file names such as `shopify.app.<env>.toml` and `.env.<env>`. `ENVIRONMENT` values and other file names need judgment. |
| A name that carries an environment ends in it, after `-`, or after `:` in a package script. | `deploy-dev`, `deploy:dev`, `plan-prod` | `catati check` for GitHub environments. Other names need judgment. |
| A secret is named for what it holds, the same in every GitHub environment. | `CLOUDFLARE_API_TOKEN` in `dev` and in `prod`, never `CATATI_API_TOKEN` | `catati check` for env and org tokens; judgment for the same name in every environment |

## Make targets

| Rule | Example | Check |
| --- | --- | --- |
| The Makefile has the targets `install`, `test`, `e2e`, `verify`, `lint`, `help`, `format` and `staged-check`. The template git hooks call `staged-check` before a commit and `lint` before a push, and name `format` as the fix. | `make e2e`, not `make e2e-test`. | `catati check` |
| A repo with a `wrangler.jsonc` has the target `deploy-dev`. | `make deploy-dev` deploys to the dev account. | `catati check` |
| The Makefile has the target `dev`. | `make dev` runs the local dev server. | judgment |
| A make target or package script that acts on one environment ends in it. A script that checks both has no environment in its name. | `make deploy-dev`, `pnpm deploy:dev`, `check:env` | judgment |
| `make verify` runs `catati check`. | `make verify` fails when `.github/ISSUE_TEMPLATE/issue.yml` differs from `templates/`. | judgment |

## Versions

| Rule | Example | Check |
| --- | --- | --- |
| A repo with a `wrangler.jsonc` has one semantic version, `MAJOR.MINOR.PATCH`, as `version` in its root `package.json`. No other `package.json` outside `node_modules` declares a `version`. | `"version": "2.1.3"` in the root `package.json`, and none in `api/package.json` | `catati check` |
| The PR that ships a change bumps the version: MAJOR for a change that breaks a user or a contract, MINOR for a new feature, PATCH for a fix. | A new booking field is MINOR. | A repo check, because which paths ship differs per repo. cat-hotel's `versionBumpMissing` in `.github/scripts/repo-rules.mjs` is the reference. |

## CI workflows and checks

| Rule | Example | Check |
| --- | --- | --- |
| The CI workflow file is `.github/workflows/ci.yml`. | `ci.yml`, not `checks.yml`. | `catati check` |
| The deploy workflow file is `.github/workflows/deploy.yml`. | `deploy.yml`, not `deploy-firebase.yml`. | `catati check` |
| A repo's only workflow files are `.github/workflows/ci.yml` and `deploy.yml`. | `plan.yml` and `apply-dev.yml` move into `ci.yml` and `deploy.yml`. | `catati check` |
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
| The status labels are `todo`, `doing`, `review` and `blocked`. `templates/labels.json` holds their names, colours and descriptions. | `doing`, not `in-progress`. | judgment |

## Exceptions

Each row that can end names the open issue that tracks its end. A row with no end date says so instead. Any other row with no open issue fails review.

| Name | Rule it breaks | Ends when | Issue |
| --- | --- | --- | --- |
| Firebase project `catati-app` | `<repo>-<component>` | Firebase is removed. | [catsper#600](https://github.com/catati/catsper/issues/600) |
| Firebase projects `catati-cat-hotel*` | `<repo>-<component>` | They are disabled or deleted. | [cat-hotel#537](https://github.com/catati/cat-hotel/issues/537) |
| `agents/.prod.env` | `.env.example` | No end date. | None. No end date. |
| Repo `catati-horizon` | The repo name is the stem. | The Horizon spike reports. | [dev#97](https://github.com/catati/dev/issues/97) |
| Shopify stores `catati-dev-store` and `3dd4ee` | `<repo>-<env>` | No end date. Shopify fixes store domains. | None. No end date. |
| `cat-hotel` api top-level Worker name `catati-cat-hotel-api` | `<repo>-<component>` | The top level stops naming it, by 2026-12-31. | [cat-hotel#533](https://github.com/catati/cat-hotel/issues/533) |
| `cat-hotel` Shopify apps `catati-cat-hotel-dev` and `catati-cat-hotel` | `<repo>-<env>` | They become `cat-hotel-dev` and `cat-hotel-prod`. | [cat-hotel#535](https://github.com/catati/cat-hotel/issues/535) |
| Turnstile widget `cat-hotel booking` | `<repo>-<component>` | `terraform` renames it to `cat-hotel-landing`. | [cat-hotel#536](https://github.com/catati/cat-hotel/issues/536) |
| GitHub environments `development` and `production` in `catsper` | `dev` and `prod` only | `catsper` renames them. | [dev#105](https://github.com/catati/dev/issues/105) |
| Catsper stem `catati-catsper`, which the dev D1 database still uses | The repo name is the stem. | No Catsper resource uses `catati-catsper`. | [dev#106](https://github.com/catati/dev/issues/106) |
