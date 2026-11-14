# Branches

## Branches

| Rule | Check |
| --- | --- |
| `main` is the only long-lived branch. | judgment |
| `catati-horizon` keeps two long-lived branches, `dev` and `main`, until the Horizon spike reports. | judgment |
| In `catati-horizon`, a work branch starts from `dev` and its PR targets `dev`. | judgment |

## Rulesets

Each repo has two branch rulesets on its default branch, `main` and `check`.

| Rule | Check |
| --- | --- |
| The `main` ruleset requires a PR and blocks force pushes and deletion. | judgment |
| In a repo that a Shopify app writes to, `shopify[bot]` is exempt from the `main` ruleset. | judgment |
| The `check` ruleset requires the checks that the repo's docs list as required. See [ci.md](ci.md#required-checks). | judgment |
| The `check` ruleset is strict, so a PR's branch must hold the current `main` before it merges. | judgment |
| The `check` ruleset has no bypass actor. Every agent acts as the operator's GitHub account, so a bypass the operator holds lets an agent merge a red PR. In an emergency the operator edits the ruleset, and GitHub records that edit. | judgment |

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
