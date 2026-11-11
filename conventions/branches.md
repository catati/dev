# Branches and deploys

## Branches

| Rule | Check |
| --- | --- |
| `main` is the only long-lived branch. | judgment |
| `catati-horizon` keeps two long-lived branches, `dev` and `main`, until the Horizon spike reports. | judgment |
| In `catati-horizon`, a work branch starts from `dev` and its PR targets `dev`. | judgment |
| The `main` ruleset requires the verify checks. | judgment |
| `shopify[bot]` keeps its ruleset bypass. | judgment |

## Session start

| Rule | Check |
| --- | --- |
| `catati session-start` sets the git hooks path. | judgment |
| `catati session-start` copies `templates/pstack-models.md` to `~/.claude/rules/`. | judgment |
| `catati session-start` checks the toolchain. | judgment |

## Environments

| Rule | Check |
| --- | --- |
| Dev runs in the `catati-dev` Cloudflare account, on `workers.dev`. | judgment |
| The domain `catati.nz` is held for a dev root domain. | judgment |
| Production runs in the `Catati` Cloudflare account. | judgment |

## Deploys

| Rule | Check |
| --- | --- |
| A merge to `main` deploys to dev through Workers Builds. | judgment |
| An agent may deploy to dev. | judgment |
| A production Worker deploy runs `npx wrangler versions upload`. | judgment |
| A person promotes a production version in the Cloudflare dashboard. | judgment |
| No cloud environment or GitHub secret holds a production token. | judgment |
