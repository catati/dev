---
name: setup-dev
description: Set a Catati repo or claude.ai project up to the Catati standard and keep it there. A project runs no scheduled reports; setup switches old routines off. Use for /catati:setup-dev, "set this repo up to the standard", re-running repo or project setup, and any old routine line that names catati:setup-dev. Idempotent.
---

# Setup dev

The argument picks the job. Read only the reference file it names, and follow it.

| Argument | Job | Read |
| --- | --- | --- |
| none, or `repo` | Set the repo up to the standard | [references/repo.md](references/repo.md) |
| `project` | Switch this claude.ai project's scheduled reports off | [references/project.md](references/project.md), Setup |
| `start`, `end <kind>`, `sod`, `hourly`, `eod`, `tidy` | An old routine called the skill: it runs no steps and says to switch the routine off | [references/project.md](references/project.md), Old routine |

Any other argument: stop, print this table's first column, and change nothing.

The standard ships in this plugin, two folders up from this file: the CLI in `scripts/`, the templates in `templates/`, the conventions in `conventions/`, and the shared rules text in `rules/catati-standard.md`. No job clones catati/dev.
