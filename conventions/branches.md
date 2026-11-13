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
| The `catati` plugin's SessionStart hook sets the git hooks path in each repo of the session: the repo that holds the project folder, or else each repo directly below it. `catati session-start` does the same for its own repo. | `test/plugin-session-start.test.mjs` |
| The plugin's SessionStart hook and `catati session-start` copy `plugins/catati/rules/pstack-models.md` to `~/.claude/rules/` when it is missing. | `test/plugin-session-start.test.mjs`, `test/session-start.test.mjs` |
| `catati session-start` checks the toolchain. | judgment |
| The plugin's WorktreeCreate hook gives a worktree subagent one locked worktree per session repo, on `worktree-<name>` at the repo's `HEAD`, and its WorktreeRemove hook deletes only a clean worktree and only a branch with no new commits. | `test/worktree.test.mjs` |
| A worktree subagent commits on its `worktree-<name>` branch and never pushes; the root merges that branch and pushes its own. | judgment |

## Environments and deploys

Environments, deploys and prod access are in [deploy.md](deploy.md).
