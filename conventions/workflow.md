# Merge and session workflow

pstack runs the work: owners, fix rounds, verification and merges follow `poteto-mode` and its playbooks. These rules are what a Catati session adds on top. The Decisions table of catati/dev#8 is where the operator decides them. This file is where a session reads them.

Each rule names what enforces it. `None` means nothing enforces the rule yet, so the session follows it by hand.

## Work

| Rule | Enforced by |
| --- | --- |
| One unit of work is one issue and one PR, and the PR closes that issue. | None |

## Merges

Merges follow pstack's Autopilot-full and Shipping playbooks.

| Rule | Enforced by |
| --- | --- |
| An independent verifier, which did not write the code, checks each PR at its head SHA and reports PASS there. | None |
| The diff touches no one-way-door path. Run `node bin/catati.mjs check-merge origin/main <head>` from `main`'s copy, never from the PR head, and it exits 0. | `catati check-merge` |
| With both, the coordinator merges by squash and names the head SHA, so a later push makes the merge fail. | The merge API's `sha` parameter; the repo's merge settings |
| A door PR, and any merge that deploys to production, goes to the operator to merge. | `catati check-merge` finds the door paths; judgment for production |

## The operator

| Rule | Enforced by |
| --- | --- |
| Ruleset writes and branch deletes go to the operator. | Auto mode blocks ruleset writes; None for branch deletes |
| The operator answers in chat. A session never asks for a secret in chat. | None |

## Sessions

| Rule | Enforced by |
| --- | --- |
| The coordinator archives each child session it starts, once that session's work is done. | None |
| A session started through the sessions API has no account plugins, so it has no pstack and no `catati` plugin. Start a session that needs them from the app. | None |
