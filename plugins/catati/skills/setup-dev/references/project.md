# Project setup

Operator, 2026-11-28: projects no longer report on a schedule. Coding work is tracked in GitHub issues and PRs, so reading them shows what is going on. Other work is discussed in the operator's hub project, which runs the only scheduled posts: a morning standup and an evening wrap that read those issues and PRs. A project set up to this standard runs no SOD, Hourly, EOD or other reporting routine.

The argument picks the branch:
- `project`: **Setup**. The operator typed `/catati:setup-dev project` in this project's chat.
- `start`, `end sod`, `end hourly`, `end eod`, `sod`, `hourly`, `eod`, `tidy`: **Old routine**. A routine made by an earlier version of this skill called it.

Shared rules for every branch:
- The **operator** is the person who owns this project and types in its chat.
- On a tool error, name the tool and the exact error.
- **Typed approvals** (lesson, 2026-11-16). A step that auto mode blocks, or that cannot be undone, runs only on the operator's own words typed in the thread that runs it.

## Old routine

Do none of the routine's steps. Post one line: "This project runs no scheduled reports any more (operator, 2026-11-28). Run /catati:setup-dev project here to switch this routine off." Then call `set_thread_resolved` with resolved true on your own thread and end the turn.

## Setup

Run it in the target project's chat, because routines bind to the project that creates them; anywhere else, stop and say so. Load `list_triggers`, `update_trigger` and `delete_trigger` in one ToolSearch call.

1. **Inventory.** `list_triggers` with `recurring=true`, `limit=100`, paging with `next_cursor` until absent. Keep the enabled recurring tasks whose `hearth_channel_id` is this project's. One-shot reminders are not routines; leave them.
2. **Classify** each task:
   - **report**: it posts a digest, a Needs-you list, a recap or a sync (any task made by an earlier version of this skill, or any SOD, Hourly or EOD). Switch it off.
   - **check**: it does real work and records the result as GitHub issues or PRs, such as a daily drift check. Keep it, unless the operator says otherwise.
   - Anything a report does that the operator still needs: name where it goes instead (a GitHub issue, or the hub project's standup).
3. **Back up** each task to switch off: its name, id, cron and prompt word for word, in `/mnt/project-files/backups/routines-<project-slug>-<NZ date>/<name>-<id>.md`.
4. **Plan.** One table for the operator: name, id, cron, kind, action (switch off or keep), where its needed work goes. Wait for the operator's yes. In an unattended run, post the plan and end.
5. **Apply** after the yes: `update_trigger` with enabled false on each task to switch off. Delete one only on the operator's typed yes naming it, because deleting also deletes every thread its runs started.
6. **Verify** with `list_triggers`: no enabled recurring task left in this project except the kept checks. Report pass or fail with ids, in at most 4 lines.

Repositories, environments, CLAUDE.md and moving work between projects stay with the operator; name them in the report when the operator seems to need them.
