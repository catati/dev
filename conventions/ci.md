# CI runs only the jobs the diff affects

A pull request runs the package jobs its diff can affect, and no others. These rules say how a Catati repo gates its CI jobs.

Each rule names what enforces it. `None` means nothing enforces the rule yet, so the session follows it by hand.

The reference implementation is `catati/cat-hotel`: `.github/scripts/changed-jobs.mjs` holds the map, `.github/scripts/changed-jobs.test.mjs` tests it, the `changes` job in `.github/workflows/ci.yml` runs it, and `ungatedPackageJobs` in `.github/scripts/repo-rules.mjs` fails CI when a package job has no gate.

## The map

| Rule | Enforced by |
| --- | --- |
| A `changes` job maps the diff to package jobs. It outputs one `true` or `false` per package job. | judgment |
| The map fails open. An unknown path, a failed diff or a failed `changes` job runs every job. | The repo's map test; judgment |
| A change to `.github/`, the root lockfile or the root `package.json` runs every job it can affect. | The repo's map test |
| A docs-only change runs no package job. The tooling job always runs. | The repo's map test |
| When a package starts to read a file outside its directory, the same PR adds that edge to the map. | judgment |

## Gates

| Rule | Enforced by |
| --- | --- |
| Each package job has `needs: changes` and an `if:` on its output, such as `if: ${{ !cancelled() && needs.changes.outputs.admin != 'false' }}`. | cat-hotel: `ungatedPackageJobs`; None elsewhere |
| Gate a job with `if:`, never with a workflow `paths:` filter. A skipped job counts as a passed required check. A workflow that never starts leaves the check pending, so the PR cannot merge. | judgment |
| An aggregate required check, such as one that waits on e2e shards, passes on `skipped` only when the map said its package did not change. Otherwise it needs `success`. | judgment |

Test `!= 'false'`, not `== 'true'`. A failed `changes` job leaves its outputs empty, and an empty output must run the job.

## Drafts and pushes to `main`

These rules keep Actions minutes near zero. Every run bills each job's time rounded up to a whole minute. The draft rule also backs pstack's rule to open every PR ready for review.

| Rule | Enforced by |
| --- | --- |
| CI runs on the `pull_request` types `opened`, `synchronize`, `reopened` and `ready_for_review`, so marking a PR ready starts a run. | cat-hotel: `ci.yml`; judgment elsewhere |
| On a draft PR the tooling job (`tooling-verify`, or `verify` in a repo with one job) fails at once with a draft notice, and no package job runs. | cat-hotel: `ci.yml`; judgment elsewhere |
| Each package job waits for the tooling job. GitHub counts a check that was skipped on the draft as passed until the ready run creates a new one. | cat-hotel: `ci.yml`; judgment elsewhere |
| A push to `main` runs only the tooling job, because the PR already ran the package jobs. This is safe only while the `check` ruleset is strict, so every PR ran its jobs on the current `main`. See [branches.md](branches.md#rulesets). | judgment |

## Required checks

| Rule | Enforced by |
| --- | --- |
| The repo's CI doc lists the required checks and the checks that run but are not required. Every job in `ci.yml` is in one of the two lists. | cat-hotel: `requiredChecksDrift` in `.github/scripts/repo-rules.mjs`, run by `ci-contract.test.mjs` on the parsed `ci.yml`; None elsewhere |
| The `check` ruleset requires exactly the checks in the required list. | judgment. CI cannot read the ruleset. |
