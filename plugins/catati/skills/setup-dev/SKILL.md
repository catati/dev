---
name: setup-dev
description: Set a Catati repo up to the Catati standard and keep it there. Use for /catati:setup-dev and "set this repo up to the standard". Covers code, repo settings, infra and the tech stack only; claude.ai projects and their scheduled tasks are not its job. Idempotent.
---

# Setup dev

The argument picks the job. Read only the reference file it names, and follow it.

| Argument | Job | Read |
| --- | --- | --- |
| none, or `repo` | Set the repo up to the standard | [references/repo.md](references/repo.md) |

Any other argument: stop, print this table's first column, and change nothing.

The standard ships in this plugin, two folders up from this file: the CLI in `scripts/`, the templates in `templates/`, the conventions in `conventions/`, and the shared rules text in `rules/catati-standard.md`. No job clones catati/dev.
