# One-way-door paths

The operator merges a PR that adds, changes or removes a file at one of these paths. `catati setup` copies this file from catati/dev into each repo's `.github/verifier-record/`, where the `verifier-record` status reads its table, so change it in catati/dev and keep its table shape.

| Path | Why it is a one-way door |
| --- | --- |
| `.github/**` | CI, required checks, branch protection, CODEOWNERS, composite actions and Dependabot. |
| `.claude/settings.json` | The permission prompts and sandbox rules of every session in the repo. |
| `.githooks/**` | Git hooks run on every developer machine and can skip the local guards. |
| `.claude/hooks/**` | Claude Code hooks run on every session. |
| `plugins/*/hooks/**` | A plugin's Claude Code hooks run in every session that syncs the plugin. |
| `.gitmodules`, and any symlink or submodule | Where each submodule is fetched from. A link can point a plain path at a door file. |
| `**/.npmrc` | The registry that installs, deploys included, fetch packages from. |
| `env/setup.sh` | The setup script of every cloud session. |
| `**/package.json` | Deploy and release scripts live in `scripts`. A PR that changes only `package.json` files and `pnpm-lock.yaml`, and changes only `version` and entries under `dependencies`, `devDependencies`, `optionalDependencies` or `pnpm.overrides`, is not a door. A change to `scripts`, `packageManager`, `engines` or any other field is (operator, 2026-11-15, cat-hotel#571). |
| `**/Makefile`, `**/GNUmakefile`, `**/*.mk` | Deploy targets. A variable or an `include` can change one without touching its lines, so any change counts. |
| `**/Dockerfile`, `**/Dockerfile.*`, `**/*.Dockerfile`, `**/Containerfile`, `**/Containerfile.*`, `**/*.Containerfile`, `**/compose*.yml`, `**/compose*.yaml`, `**/docker-compose*` | What the deployed containers run. |
| `**/wrangler.toml`, `**/wrangler.json`, `**/wrangler.jsonc`, `**/shopify.app*.toml` | Deploy config and the projects it targets. |
| `**/migrations/**` | Data migrations. |
| `plugins/catati/templates/githooks/**` | `catati setup` copies these into the Git hooks of every repo. |

Lockfiles are not doors. CI checks a dependency bump.
