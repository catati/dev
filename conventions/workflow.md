# Owner and merge workflow

These rules hold in every session, so a new session builds and merges PRs the same way as the last one. The Decisions table of catati/dev#8 is where the operator decides them. This file is where a session reads them.

Each rule names what enforces it. `None` means nothing enforces the rule yet, so the session follows it by hand.

There is no LLM reviewer step. The guards are the static checks, the tests and required CI.

## Owners

| Rule | Enforced by |
| --- | --- |
| One unit of work is one issue and one PR. | None |
| One owner subagent (`pstack:poteto-agent`) builds each PR, in its own git worktree. Its brief names the goal, the scope, the evidence and the paths it must not write. | None |
| A fix round goes to a fresh owner, whose brief carries the first brief, every later directive and the last report. | None |

## Merges

The merge-gate trial is the one exception to "Only the operator merges" in [branches.md](branches.md).

| Rule | Enforced by |
| --- | --- |
| The trial covers `catati/dev` only, for its next five PRs from 2026-11-08. Every other merge stays with the operator. The coordinator merges without the operator only when every row below holds at the current head SHA. | None |
| The required checks are green. | The `main` ruleset (`verify`) |
| The diff touches no one-way-door path. Run `node bin/catati.mjs check-merge origin/main <head>` from `main`'s copy, never from the PR head, and it exits 0. | `catati check-merge` |
| No push came after the checks ran. The merge names the head SHA the checks ran on, so a later push makes the merge fail. | The merge API's `sha` parameter |
| The operator reads each merged diff afterwards and notes any they would have rejected. With none rejected, the trial extends to the four app repos. With any, it is tightened first. | None |
| A PR merges by squash only. | The repo's merge settings |

## Doors and the operator

| Rule | Enforced by |
| --- | --- |
| A door PR goes to the operator to merge. | `catati check-merge` finds the door paths; judgment for production |
| Ruleset writes and branch deletes go to the operator. | Auto mode blocks ruleset writes; None for branch deletes |
| The operator answers in chat. A session never asks for a secret in chat. | None |

## Sessions

| Rule | Enforced by |
| --- | --- |
| The coordinator archives each child session it starts, once that session's work is done. | None |
| A session started through the sessions API has no account plugins, so it has no pstack and no `catati` plugin. Start a session that needs them from the app. | None |
