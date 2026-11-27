---
name: setup-dev
description: Set a Catati repo or claude.ai project up to the Catati standard and keep it there, or run a routine's start, end, sod, hourly, eod or tidy step. Use for /catati:setup-dev, "set this repo up to the standard", re-running repo or project setup, and every routine line that names catati:setup-dev. Idempotent.
---

# Setup dev

The argument picks the job. Read only the reference file it names, and follow it.

| Argument | Job | Read |
| --- | --- | --- |
| none, or `repo` | Set the repo up to the standard | [references/repo.md](references/repo.md) |
| `project` | Set this claude.ai project's Focus stream and routines up | [references/project.md](references/project.md), Setup |
| `start` | A routine's first line | [references/project.md](references/project.md), Start |
| `end sod`, `end hourly`, `end eod` | A routine's last line | [references/project.md](references/project.md), End |
| `sod`, `hourly`, `eod`, `tidy` | One sync step | [references/project.md](references/project.md), Sync |

Any other argument: stop, print this table's first column, and change nothing.

The standard ships in this plugin, two folders up from this file: the CLI in `scripts/`, the templates in `templates/`, the conventions in `conventions/`, and the shared rules text in `rules/catati-standard.md`. No job clones catati/dev.
