# Issues and PRs

Title formats and status label names are in [naming.md](naming.md).

## Repo instructions

| Rule | Check |
| --- | --- |
| `CLAUDE.md` says "Build with `/pstack:poteto-mode`. This file wins over poteto on …" and names each override. | judgment |
| `CLAUDE.md` links to `catati/dev/conventions/`. | judgment |
| `CLAUDE.md` keeps a rule table that pairs each rule with what enforces it. | judgment |

## Issues

| Rule | Check |
| --- | --- |
| `.github/ISSUE_TEMPLATE/issue.yml` equals `templates/issue.yml`. | `catati-dev check` |
| An issue fills the form fields Card, What to build, Acceptance criteria and Blocked by. | judgment |
| An open issue has exactly one status label. | judgment |
| `todo` means planned and ready. `doing` means a builder has it. `review` means its PR is open. `blocked` means it waits on a person. | judgment |
| Work that spans several issues has one epic issue. Each issue is a native GitHub sub-issue of the epic. | judgment |

## Pull requests

| Rule | Check |
| --- | --- |
| `.github/pull_request_template.md` equals `templates/pull_request_template.md`. | `catati-dev check` |
| A PR body keeps the template sections in order: `## Why`, the Note card with `Closes #N`, What changes and Risk, then Summary, Evidence, Guards and Merge Danger inside Details. | judgment |
| Guards has one line per accepted review finding, `- <finding> → <rung>: <artefact or #N>` or `- <finding> → one-off: <reason>`, or `None`. | judgment |
| Merge Danger sets Door to `two-way` when a revert restores the previous behaviour, and to `one-way` otherwise. | judgment |
| Merge Danger names the smallest affected surface in Blast Radius. | judgment |

## Evidence

| Rule | Check |
| --- | --- |
| `make verify` exits 0 in a fresh `dev` cloud session. | judgment |
| Each PR gets a preview URL on dev resources. | judgment |
| `verify-journeys` runs against the preview URL. | judgment |
| Evidence maps each acceptance criterion to an artefact. | judgment |
| A blocked step is a named proof gap, never a pass. | judgment |
