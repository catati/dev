# Issues and PRs

Title formats and status label names are in [naming.md](naming.md).

## Repo instructions

| Rule | Check |
| --- | --- |
| `CLAUDE.md` links to `catati/dev/conventions/`. | judgment |
| `CLAUDE.md` keeps a rule table that pairs each rule with what enforces it. | judgment |

## Issues

| Rule | Check |
| --- | --- |
| `.github/ISSUE_TEMPLATE/issue.yml` equals `templates/issue.yml`. | `catati check` |
| An issue fills the form fields Card, What to build, Acceptance criteria and Blocked by. | judgment |
| An open issue has exactly one status label. | judgment |
| `todo` means planned and ready. `doing` means a builder has it. `review` means its PR is open. `blocked` means it waits on a person. | judgment |
| Work that spans several issues has one epic issue. Each issue is a native GitHub sub-issue of the epic. | judgment |

## Verification

The gates a repo provides. pstack decides when to run them.

| Rule | Check |
| --- | --- |
| `make verify` exits 0 in a fresh `dev` cloud session. | judgment |
| Each PR gets a preview URL on dev resources. | judgment |
