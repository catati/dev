# Owner, verifier and merge workflow

These rules hold in every session, so a new session builds and verifies PRs the same way as the last one. The Decisions table of catati/dev#8 is where the operator decides them. This file is where a session reads them.

Each rule names what enforces it. `None` means nothing enforces the rule yet, so the session follows it by hand.

## Owners

| Rule | Enforced by |
| --- | --- |
| One unit of work is one issue and one PR. | None |
| One owner subagent (`pstack:poteto-agent`) builds each PR, in its own git worktree. Its brief names the goal, the scope, the evidence and the paths it must not write. | None |
| A fix round goes to a fresh owner, whose brief carries the first brief, every later directive and the last report. | None |

## Verifiers

| Rule | Enforced by |
| --- | --- |
| A non-trivial PR gets an independent adversarial verifier, at the PR's exact head SHA. | `/catati:verify-pr` |
| The verifier runs on a model family other than the author's: `sonnet` when the author was Opus, `opus` when the author was Sonnet. | `/catati:verify-pr` |
| The verifier uses the one standard brief in `plugins/catati/skills/verify-pr/SKILL.md`, and returns `PASS`, `PASS WITH GAPS` or `FAIL`. | `/catati:verify-pr` |
| `PASS WITH GAPS` counts as a pass only when every gap is minor and filed as an issue. | `/catati:verify-pr` |
| A gap in a PR that is already merged goes to a new issue and PR. | None |

## The verified comment

| Rule | Enforced by |
| --- | --- |
| When a verifier passes a PR, one comment on the PR records it. Its first line has the format below. The rest gives the verdict, the verifier's model and the links to the gap issues. | `/catati:verify-pr` |
| A PR is ready for the operator only when the SHA in that first line equals the PR's current head. | None |
| A commit that lands after the comment makes the verdict stale. A new verifier run is needed. | None |
| The marker is a comment, not a commit status or a title suffix. The proxy refuses commit statuses with HTTP 403, and a title suffix would reach the squash commit. | None |

The comment is a record for the operator, and no check blocks a merge on it. The operator dropped the planned `verified` check, issue 47, on 2026-11-08.

The first line of the comment is exactly `Verified at ` and the full 40-character lowercase head SHA, with nothing else on the line. It matches this regular expression:

```text
^Verified at [0-9a-f]{40}$
```

A short SHA, a leading space, Markdown such as `**`, or text after the SHA does not match. `npm test` fails when `plugins/catati/skills/verify-pr/SKILL.md` and this file stop stating the same expression.

## Merges

The merge-gate trial is the one exception to "Only the operator merges" in [branches.md](branches.md).

| Rule | Enforced by |
| --- | --- |
| The trial covers `catati/dev` only, for its next five PRs from 2026-11-08. The coordinator merges without the operator only when every row below holds at the current head SHA. | None |
| The required checks are green. | The `main` ruleset (`verify`) |
| The verified comment names the current head, and its verdict passes. | None |
| The diff touches no one-way-door path. Run `node bin/catati-dev.mjs check-merge origin/main <head>` from `main`'s copy, never from the PR head, and it exits 0. | `catati-dev check-merge` |
| The diff touches nothing in production. No path list can prove this. | judgment |
| No commit landed after the verdict. The merge names the verified head SHA, so a later push makes the merge fail. | The merge API's `sha` parameter |
| The operator reads each merged diff afterwards and notes any they would have rejected. With none rejected, the trial extends to the four app repos. With any, it is tightened first. | None |
| A PR merges by squash only. | The repo's merge settings |

## Doors and the operator

| Rule | Enforced by |
| --- | --- |
| A door PR goes to the operator to merge, after its verified comment. | `catati-dev check-merge` finds the door paths; judgment for production |
| Ruleset writes and branch deletes go to the operator. | Auto mode blocks ruleset writes; None for branch deletes |
| The operator answers in chat. A session never asks for a secret in chat. | None |

## Sessions

| Rule | Enforced by |
| --- | --- |
| The coordinator archives each child session it starts, once that session's work is done. | None |
| A session started through the sessions API has no account plugins, so it has no pstack and no `/catati:verify-pr`. Start a verifier session from the app. | None |
