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
