# Branches

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

## Environments and deploys

Environments, deploys and prod access are in [deploy.md](deploy.md).
