# Issues and PRs

Title formats, status label names and the labels file are in [naming.md](naming.md).

## Repo instructions

| Rule | Check |
| --- | --- |
| `CLAUDE.md` links to `catati/dev/conventions/`. | judgment |
| `CLAUDE.md` keeps a rule table that pairs each rule with what enforces it. | judgment |
| A rule-table row that restates a convention stays only when it adds something repo-specific: a repo enforcer, a repo name or account, or a stricter local form. A row that adds nothing to the convention goes. | judgment |
| A kept row links the convention section instead of copying its wording. | judgment |

## Issues

| Rule | Check |
| --- | --- |
| `.github/ISSUE_TEMPLATE/issue.yml` equals `templates/issue.yml`. | `catati check` |
| An issue fills the form fields Card, What to build, Acceptance criteria and Blocked by. | judgment |
| An issue that waits on another issue records it as a native `blocked_by` dependency. A PR records its merge order in its body instead, as [Merges](#merges) says. | judgment |
| An open issue has exactly one status label. | judgment |
| `todo` means planned and ready. `doing` means a builder has it. `review` means its PR is open. `blocked` means it waits on a person. | judgment |
| Work that spans several issues has one epic issue. Each issue is a native GitHub sub-issue of the epic. | judgment |

## Verification

The gates a repo provides. pstack decides when to run them.

| Rule | Check |
| --- | --- |
| `make verify` exits 0 in a fresh `dev` cloud session. | judgment |
| Each PR gets a preview URL on dev resources. | judgment |

## Merges

pstack decides who verifies a PR, when, and who posts the verifier record, as the playbook in use says: [Shipping](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/shipping.md) or [Autopilot-full](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/autopilot-full.md).

| Rule | Check |
| --- | --- |
| A merge needs a PR comment whose first line is exactly `VERIFIER PASS <sha>`, where `<sha>` is the PR's full 40-character head SHA. | judgment |
| A PASS+NOTES verdict has the same first line, with the notes on the lines below it. | judgment |
| A failed verdict's first line is `VERIFIER FAIL <sha>`. | judgment |
| The record names the head being merged. Whether a verdict carries over to a new head, and who re-posts the record, is the pstack playbook's call. | judgment |
| The merge call pins the verified head: `expectedHeadSha` on `mcp__github__merge_pull_request`, `--match-head-commit <sha>` on `gh pr merge`, or `sha` on a REST merge. | judgment |
| When one PR must merge before another, the later PR's body holds one line `Blocked by: <ref>, <ref>`. Each ref is `#N` or `owner/repo#N` and names an issue or a PR. GitHub refuses a native `blocked_by` dependency on a PR. | judgment |
| A PR whose `Blocked by:` line names an open issue or PR does not merge. | judgment |
| A PR that changes a [one-way-door path](#one-way-door-paths), or whose merge changes prod, is the operator's to merge, after its verifier record and green required CI. See [Who changes prod](deploy.md#who-changes-prod). | judgment |
| Any other PR merges only with a verifier record that names its head and with green required CI. The pstack playbook in use decides when it merges and which session merges it. A repo's own merge rule can narrow that. | judgment |

### One-way-door paths

The operator merges a PR that adds, changes or removes a file at one of these paths. No tool reads this list. A path list cannot prove that a change leaves prod alone, so a change that touches prod is the operator's to merge too, such as a deploy script that a `Makefile` target calls.

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
| `**/package.json` | Deploy and release scripts live in `scripts`. |
| `**/Makefile`, `**/GNUmakefile`, `**/*.mk` | Deploy targets. A variable or an `include` can change one without touching its lines, so any change counts. |
| `**/Dockerfile`, `**/Dockerfile.*`, `**/*.Dockerfile`, `**/Containerfile`, `**/Containerfile.*`, `**/*.Containerfile`, `**/compose*.yml`, `**/compose*.yaml`, `**/docker-compose*` | What the deployed containers run. |
| `**/wrangler.toml`, `**/wrangler.json`, `**/wrangler.jsonc`, `**/shopify.app*.toml`, `firebase.json`, `.firebaserc` | Deploy config and the projects it targets. `firebase.json` and `.firebaserc` count only at the root, where the Firebase CLI reads them. |
| `firestore.rules`, `storage.rules`, `firestore.indexes.json` | The access rules and indexes of live data. These count only at the root, so a `firestore.rules` in a subfolder is not a match. |
| `**/migrations/**` | Data migrations. |
| `templates/githooks/**` | `catati setup` copies these into the Git hooks of every repo. |

Lockfiles are not doors. CI checks a dependency bump.
