# Naming

These names apply to every Catati repo. The Exceptions section lists the names that stay as they are for now.

## Repos and resources

| Rule | Example | Check |
| --- | --- | --- |
| The repo name is the stem of every name the repo owns. | Repo `cat-hotel` has the stem `cat-hotel`. | judgment |
| A resource name is `<repo>-<component>`. | The admin Worker of `cat-hotel` is `cat-hotel-admin`. | judgment |
| A resource name has no environment suffix. | Dev and prod both use `cat-hotel-admin`, never `cat-hotel-admin-dev`. | judgment |

## Make targets

| Rule | Example | Check |
| --- | --- | --- |
| The Makefile has the targets `install`, `test`, `e2e`, `verify`, `lint` and `help`. | `make e2e`, not `make e2e-test`. | `catati check` |
| The Makefile has the targets `dev` and `deploy-dev`. | `make deploy-dev` deploys to the dev account. | judgment |
| `make verify` runs `catati check`. | `make verify` fails when `.github/pull_request_template.md` differs from `templates/`. | judgment |

## CI workflows and checks

| Rule | Example | Check |
| --- | --- | --- |
| The CI workflow file is `.github/workflows/ci.yml`. | `ci.yml`, not `checks.yml`. | `catati check` |
| The deploy workflow file is `.github/workflows/deploy.yml`. | `deploy.yml`, not `deploy-firebase.yml`. | judgment |
| CI has one check named `verify`. | `agents` reports one `verify` check. | judgment |
| A monorepo has one check per package, named `<package>-verify`. | The `cat-hotel` admin check is `admin-verify`, not `admin/verify`. | judgment |
| The check for PR titles and bodies is named `pr-format`. | `pr-format`, not `tooling/pr-format`. | judgment |

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
| An issue title and a PR title are `<area>: <outcome>`. | `conventions: Write the shared naming, branch and PR rules` | judgment |
| The status labels are `todo`, `doing`, `review` and `blocked`. | `doing`, not `in-progress`. | judgment |

## Exceptions

| Name | Rule it breaks | Ends when |
| --- | --- | --- |
| Firebase projects `catati-app` and `catati-cat-hotel*` | `<repo>-<component>` | Firebase is removed. |
| `agents/.prod.env` | `.env.example` | No end date. |
| Repo `catati-horizon` | The repo name is the stem. | The Horizon spike reports. |
