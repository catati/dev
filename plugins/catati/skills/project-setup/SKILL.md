---
name: project-setup
description: Set up a project (new, existing or messy) with its Focus stream and its three routines, or run the start, end, sod, hourly, eod or tidy step a routine calls. Use for /catati:project-setup or re-running project setup. Idempotent.
---

# Project setup

Pick the branch from the argument:
- `start`: **Start**. The first line of every routine. Read only the shared rules and the Start section, then go back to the routine.
- `end sod`, `end hourly`, `end eod`: **End**. The last line of every routine. Run the Sync for that kind, then Close the run.
- `sod`, `hourly`, `eod`, `tidy`: **Sync**. Read only the Sync section. (Older routines call these directly from their sync line; it still works.)
- none or `setup`: **Setup**. The operator typed `/catati:project-setup` in this project's chat.

Shared rules for both branches:
- The **operator** is the person who owns this project and types in its chat.
- Database: `URL = https://claude.ai/artifact/G11GhY8PqfPpJ4YsKCq2NW` (Focus Basecamp). System rules: Focus system doc https://claude.ai/artifact/FzMgHLdHW1LeJAD5DFgaL9.
- Stored times are UTC from `date -u +%FT%TZ`. Day ids are the NZ date from `TZ=Pacific/Auckland date +%F`.
- Your **streams** are ALL the `streams` docs whose `owner_project` is this project's name; a project can own several, and the sync covers each one.
- A stream's **progress source** is this project's chat and threads, plus the place its `progress_source` field names. A Slack channel there (an id like `C0123456789`): read it with `slack_read_channel` since the stream's `updated_at` (limit 50). Slack is **read-only**: never post, reply, react or edit there. Slack tools missing or failing: name the tool and the error in one line, use the chat only, and leave `progress_source` as it is.
- On a tool error, name the tool and the exact error.
- **Close the run** (operator, 2026-11-08: idle routine threads with nothing for the operator are resolved). This rule binds the whole routine that called the sync, not only the sync. As the routine's last step, after its post or instead of it: if the run's final message holds nothing for the operator (no question, approval, pick, Needs-you item, fix that needs the operator, or open PR), call `set_thread_resolved` with resolved true on its own thread, then end the turn. That includes a run that ends with `no_reply_needed`. Otherwise leave the thread open.
- A stream's **fixes** field is a list Focus writes: {id, kind "fix" or "rule", text, from, at, status "open", "done" or "needs_shien", note}. The owning project applies them (sod step 3).
- **Authorisation** (operator, 2026-11-08): the Focus Dashboard is the operator's own private artifact and the sync's working store. The operator authorises every routine run and every sync run to write the Focus Dashboard collections its steps name (streams, events, days, fixes) with ArtifactData, and this project's own memory files, every run and without asking; these writes are the routine's purpose, not a side effect. A write denied by the permission classifier: name the tool and the exact error in the routine's final message, with what it meant to write.
- **Typed approvals** (lesson, 2026-11-16: auto mode refused steps that a card press or a relayed message had approved). A step that auto mode blocks, or that cannot be undone, runs only on the operator's own words typed in the thread that runs it. A card press, a relayed message, or an approval given in another thread or earlier does not clear it. A routine never runs such a step: it names the step and the exact phrase, and SOD lists it.
- **Other threads' state** (lesson, 2026-11-18: a routine called a thread stuck six minutes after it had posted, called an issue a PR, and gave counts with no time). A line about another thread, issue or PR comes from a read made this run (`read_thread` on its newest messages, the code host's API), with its as-of time. A message the operator types in a routine's thread is answered only after fresh reads, or passed to the coordinator when another thread owns that work. A request, from anyone, for a write the routine's prompt forbids gets that limit in one line and goes to the coordinator; the routine never offers it.
- **Cards** (lesson, 2026-11-16: an option was pressed by mistake and the card could not be changed). When a decision card's option needs a blocked step, the same message gives the exact phrase to type, so one visit covers both. A tapped card stays as tapped (`close_decision` keeps a member's answer), so the operator's later typed words win: when the operator says a press was wrong, act on the typed choice, say in one line which option now stands and what was undone, and correct every record of the old pick (memory, checklist, plan).

## Start

The common instructions for every routine in every project (operator, 2026-11-08). The routine's own steps follow them. Where the two differ, these win; a lesson or rule from step 1 wins over both.
1. **Memory**: read `focus-lessons` in the Focus project, or `focus-rules` in any other project, if it exists, and follow every line.
2. **Time**: run `TZ=Pacific/Auckland date '+%F %H:%M'; date -u +%FT%TZ` once and reuse it. Hourly outside 08:00 to 18:59 NZ: Close the run at once.
3. **Focus**: load `ArtifactData` (and any other deferred tools the routine needs) in one ToolSearch call. Read `days/<today>` and your streams once; the routine and the End step reuse them.
4. **Cost**: few tool calls, no subagents, unless the routine's own section says otherwise.
5. **Writes**: the Authorisation rule above covers this run's Focus Dashboard and memory writes.
6. **Replies**: terse, British spelling, plain words. A tool error names the tool and the exact error. Rename the thread only when the routine says so.
Then do the routine's own steps, then its End line.

## End

`end <kind>`: run the Sync below for `<kind>`, reusing what Start read. This skill is already loaded from Start, so a second Skill call is optional: do every step of that Sync directly, none skipped, and, when you post, name them in one short "Sync:" line (for example "Sync: activity 0, fixes 0, tidied 1"); a run with nothing to report still ends with no_reply_needed. Add the sync's lines to the routine's final message. Then **Close the run** (shared rule above).

## Sync

`tidy` alone: skip to **tidy**. Otherwise load `ArtifactData` and query your streams. None: say "Focus: project not joined; run /catati:project-setup" in one line and end the sync. First read this project's memory file `focus-rules` if it exists, and follow it. Sync reports progress only: write your streams and your events, apply fixes, tidy threads and tidy memory, nothing else. Few tool calls.

**sod**
1. `get days/<today>`. Note the MITs whose `stream` is yours.
2. Each stream: `get`, read its progress source, then `update` with `if_version`: state (on track, at risk or blocked), focus, blockers, needs_shien, needs_link, updated_at, source "owner". Keep `progress_source`. Five short lines in total per stream.
3. **Fixes** (operator, 2026-11-08: Focus fixes the projects). Each stream's `fixes` with status "open": kind "rule": add it as one line to this project's memory file `focus-rules` (create it, under 4 KB), then status "done". Kind "fix" that the sync can do itself (a stream field, a memory line): do it, then status "done". A fix that needs a routine change: status "needs_shien", note "run /catati:project-setup". Write `fixes` back with `if_version`. Add "Fixes: N done, M need you" to the final message, with one line for each needs_shien fix.
4. You own a MIT today: add "On MIT: <title>" to the routine's final message.
5. `query ideas` where stream is yours and status "active": each with `revisit_on` on or before today goes in the final message as "Idea due: <title> – <next_step>".

**hourly**
1. Outside 08:00 to 18:59 NZ: end the sync.
2. Run **tidy**, then go on.
3. **Activity** (operator, 2026-11-08: everything the operator does reaches Focus within the hour). Each stream: read its progress source since the stream's `updated_at` (`list_threads` with since = updated_at, plus its Slack channel if set). Nothing new: skip it. Something moved: `update` with `if_version` only the changed fields of state, focus, blockers, needs_shien and needs_link, plus updated_at; then `set events/<slug>-<UTC YYYYMMDDTHHMM>` {stream, at, kind "activity", note: one line on what moved}.
4. `get days/<today>`. No MIT on your streams: end the sync.
5. Each such MIT: find its pieces done since your last event (`query events` where stream == slug, order_by at desc, limit 1). A piece is done when its output exists here: an issue, PR, commit, file, or a decision in this chat or in the stream's progress source. None done: end the sync.
6. `set events/<slug>-<UTC YYYYMMDDTHHMM>` {stream, at, kind "hourly", mit_id, pieces_done: [piece outputs, copied character for character], note: one line}; when step 3 wrote an event this run, update that event instead of setting a second one. Then `update streams/<slug>` focus and updated_at, with `if_version`.

**tidy** (operator, 2026-11-08: stalled threads are closed or raised)
1. `list_threads` on this project, paging with `next_cursor` until absent. Keep threads idle 24 h or more; skip your own thread and any in state working. `read_thread` (limit 10) on each kept thread, at most 10 threads.
2. **Obviously stalled**: its work has ended or cannot go on, and nothing is owed. That is: state done; or every PR it opened is merged or closed; or state failed or stopped with no open PR. And no unanswered question to the operator. Resolve each one, at most 5 a run: `set_thread_resolved` on that thread; if the tool resolves only your own thread, `message_thread` it: "Hourly tidy: your work has ended and nothing is owed; resolve this thread." Resolving is reversible.
3. **Everything else** idle 24 h or more (blocked, review_ready, an open PR, a question to the operator, or unsure): only in the first run of the NZ day (08:00 to 08:59), send ONE `message_coordinator` with one line per thread: title, link, state, idle age, what it waits on. List the threads that wait on the operator (an open PR, an ask or a question to the operator) first, under their own count, apart from threads that are only idle. Other runs: leave them.
4. Never resolve a thread with an open PR or an unanswered question to the operator. When anything was resolved, asked to resolve, raised or flagged, add "Tidied: N resolved, A asked to resolve, M raised (W waiting on the operator), P PRs flagged" to the routine's final message. Count a thread as resolved only when `set_thread_resolved` succeeded on it.
5. **Open PRs** (lesson, 2026-11-16: a PR subscription sends no event when main moves, so conflicted PRs sat for hours until the operator noticed). Every tidy run, whatever the thread's idle age or state: `list_prs` (limit 50) and keep the open ones, at most 10. Read each one's mergeable state on the code host (GitHub: `gh api repos/<repo>/pulls/<n> --jq .mergeable_state`). `dirty`, `behind` where the repo requires up-to-date branches, or a failed `ci_rollup_state`: `message_thread` the thread that opened it (match the PR's `session_id` in `list_threads`): "PR #N at <short head SHA> is <state>: merge main, fix, re-verify." Skip it when that thread's last 10 messages already name this PR and head. Never push, merge or comment here.
6. **One owner per shared branch** (lesson, 2026-11-16: two threads merging into one main kept colliding on the version and the migrations). Two or more threads each have an open PR in one repo, and those PRs change the same version file or migration folder (their changed files): ask the coordinator to make one thread the owner of all of them, merging one at a time and re-verifying after each merge. Put it in the step 3 message when there is one; ask once a day.
7. **One checkpoint per release.** A release waits in one checkpoint thread: work threads tell it as each piece merges, and only it tells the operator the release is ready. Never resolve it before the release ships and its post-deploy checks pass. A second open thread for the same release is a duplicate: raise it in the step 3 message.

**eod**
1. As sod step 2, with tomorrow's likely focus, then sod step 3 (fixes).
2. You own a MIT today: `set events/<slug>-<UTC stamp>` {stream, at, kind "eod", mit_id, pieces_done, note: one-line result}.
3. Run **memory**.

**memory** (operator, 2026-11-19: the sync tidies every project's memory once a day, as Cat Hotel's EOD did from 2026-11-16)
The memory folder is the one this session's memory instructions name, and MEMORY.md is its index.
1. Back up: copy every file in the folder to `/mnt/project-files/memory-tidy/<NZ date>/`. Remove backup folders there older than 14 days.
2. Read MEMORY.md and every file in the folder. Read what changed today: `list_threads` with since = today 00:00 NZ, `read_thread` (limit 10) on each, at most 10, and for each repository configured for this project `gh api -X GET search/issues -f q='repo:<owner>/<repo> is:pr is:merged merged:>=<NZ date>' --jq '.items[] | [.number, .title] | @tsv'`.
3. Edit, re-reading each file just before you write it, because the coordinator and threads write memory too and the last write wins:
   - Fold done work into one short past-tense line, or drop it when the repo, an issue or a PR already records it.
   - Drop ids, SHAs, run ids and dates that no open item needs. Drop duplicates: the fact stays in its topic file, with one pointer line in MEMORY.md.
   - Update facts that changed today (versions, live routines, open asks), each from a read made this run (`gh api repos/<owner>/<repo>/issues/<n> --jq '[.state, (.pull_request != null)]'` or `read_thread`). Another thread's claim is not a source.
   - Add a lasting fact learned today that a new thread would otherwise have to ask the operator, in the topic file it belongs to.
   - Keep every live rule, every operator preference, every "never" or "only" line, and every open ask until the operator's own words in a thread answer it. Re-probe an open ask that states world state (CI, billing, prod, an issue or PR), and drop it once the probe shows it resolved. Never weaken or reword a rule's meaning. When two lines disagree, keep both and report them.
   - `focus-rules` and `focus-lessons` change only through fixes (sod step 3).
   - Keep each file under 4 KB, and MEMORY.md a short index with one line per subject, where every `[[name]]` names a file that exists. No secrets, tokens, or customer names, emails or phones.
4. Delete a topic file only when all of it is done and recorded elsewhere, and no other file links to it.
5. Report only when a file was deleted or two lines disagree: "Memory: N files edited, deleted <names>; backup /mnt/project-files/memory-tidy/<NZ date>/", plus one Needs-you line per disagreement. Otherwise the tidy is a quiet write.

## Setup

One path for a new project (full init), an existing one (update) and a messy one (clean-up). Every step writes only what differs. Run it in the target project's chat, because routines bind to the project that creates them; anywhere else, stop and say so. Load `list_triggers`, `create_trigger`, `delete_trigger` and `ArtifactData` in one ToolSearch call.

### Routines

| Kind | Name | Cron | Job |
|---|---|---|---|
| sod | `<Project> – SOD` | `CRON_TZ=Pacific/Auckland 0 8 * * *` | Triage, read-only checks, Needs-you list, weekly or monthly reports |
| hourly | `<Project> – Hourly` | `CRON_TZ=Pacific/Auckland 52 8-18 * * *` | Acts: applies approvals, starts work threads, fixes red items |
| eod | `<Project> – EOD` | `CRON_TZ=Pacific/Auckland 0 18 * * *` | Recap, stuck list, retros, artifact refreshes |

- SOD and EOD run at exactly 08:00 and 18:00 (the operator's rule). Hourly runs at minute 52 (operator, 2026-11-08), in the sprint break after a 50-minute sprint and before Focus Hourly at :56, in work hours only, on Haiku 5.5: an empty Opus run costs about US$0.51. A different minute counts as a changed cron.
- Every routine prompt starts with its **marker**, the only thing that identifies it:
  ```
  Routine: <project-slug>/<kind> v<N>
  Consolidated from: <trig_id>, ...   (or "none")
  ```
- Right after the marker comes the **start line**, exactly: `Start: use the Skill tool to run catati:project-setup with args "start" and follow it, then do the steps below.` It carries the common instructions, so no routine repeats them.
- **No hourly** (lesson, 2026-11-16: projects that dropped the hourly never ran tidy, so stalled threads and conflicted PRs went unswept). When the operator keeps a project without an hourly routine, the sod prompt carries the **tidy line**, exactly `Tidy: use the Skill tool to run catati:project-setup with args "tidy" and follow it.`, right before its Post section, and Verify expects no hourly.
- Every routine prompt ends with the **end line**, exactly: `End: use the Skill tool to run catati:project-setup with args "end <kind>" and follow it.` It stands alone, outside every section. An older `Project sync: ...` or `Focus sync: ... project-focus ...` line counts as a changed end line.
- **Replace** is the only way to change a routine: `update_trigger` refuses prompt, name, cron and model changes. Create the new task with `v<N+1>`, where N is the replaced task's own version, then **clean up** the old one.
- **Clean up** (operator, 2026-11-08: a project keeps only its 3 routines): after Verify passes, delete each replaced routine, folded source and absorbed task with `delete_trigger`. Deleting also deletes every thread that task's runs started, so the plan names each task to delete and its run count, and the operator's yes covers exactly that list.
- Models: hourly Haiku 5.5; sod and eod Sonnet 5.5 (operator, 2026-11-08). Claude cannot set a task's model (create_trigger has no model field; update_trigger refuses), so the report lists every task created this run with its model for the operator to set at claude.ai.

### Steps

1. **Preflight.** `ArtifactData list` on `streams`. A failure ends Setup.
2. **Stream.** Every doc whose `owner_project` is this project is one of its streams; keep them all. None: the doc whose `name` matches this project, else a new kebab-case slug. Two or more match by name only: ask the operator once which this project owns. Missing: `set` {name, owner_project, state, focus, blockers, needs_shien, needs_link, updated_at, source "owner"} from this project's chat and memory. Present: `update` with `if_version` the fields that differ, always owner_project and source "owner".
3. **Inventory.** `list_triggers` with `recurring=true`, `limit=100`, paging with `next_cursor` until absent. Keep the recurring tasks whose `hearth_channel_id` is this project's.
4. **Classify** each task:
   - **canonical**: has a marker. Two of one kind: the higher version is canonical; the other goes on the clean-up list.
   - **absorbed**: switched off and listed in a canonical `Consolidated from`. Clean it up.
   - **source**: everything else. Fold a switched-off source only if the operator says so; list it in the plan.
5. **Assign** each source by what it does: acts, or runs more often than daily, goes to hourly; morning triage, digests, weekly or monthly reports go to sod; recap, retro, artifact refresh go to eod. A weekday or monthly cadence becomes a gate at the top of its section ("Mondays only:", "First Monday of the month only (NZ day ≤ 7):"). Unclear: ask the operator.
6. **Merge** one prompt per kind, in this order:
   1. Marker, then the start line.
   2. Rename line: `<Project> SOD – <D Mon>` or `<Project> EOD – <D Mon>` (NZ date); hourly `<Project> Hourly – <HH:00> <D Mon>`, only when it posts.
   3. **Global rules**: every source's prohibitions, each verbatim. Where two conflict, keep the stricter and name the conflict in the plan.
   4. **Sections**: one per source, titled by its job, gate first, its steps word for word. Strip what the merge supplies once: rename line, global rules, the source's own post step, and anything Start or End already does (memory read, memory tidy, time, tool loading, few tool calls, tool-error rule, Focus sync, resolving the thread). Read-only scope stays in its section. Identical steps (same tool, query and output) run once; name every section that uses the result. Each section keeps its failure rule.
   5. **Post**: sod: one Needs-you list, one line per item with link, action and age, or one line when empty. The list holds every open PR, prod ask and typed-phrase ask that waits on the operator, whatever its age, and quotes each phrase exactly as the operator must type it, with the link to the thread where it must be typed (typing it in the routine's thread clears nothing). hourly: post only on change, else end with no_reply_needed. eod: the day in at most 5 lines, then Stuck, then artifacts.
   6. End line.
   A kind with no source: marker, start line, rename line (only when it posts), "Global rules: none.", "This routine has no sections yet.", the post rule "Post only what the sync reports; nothing to report: end with no_reply_needed.", end line. Set `notifications.push` true if any merged source had it.
7. **Diff** each kind's prompt, name and cron against its canonical task. The prompt diff includes the start line, the end line, the rename line, the tidy line (projects with no hourly) and the Post rule (a missing start or end line counts as changed): a kind with no sections must carry the no-source rename line ("only if you post") and post rule word for word, or it counts as changed. Nothing differs and the stream did not change: report "Project already set up" and end Setup.
8. **Plan.** One table for the operator: kind, action (create, replace, no change), sources folded (name and id), gates, rule conflicts, tasks to clean up (name, id, run count), stream change. Attach the three prompts as files. Wait for an explicit yes. In an unattended run, post the plan and end.
9. **Apply** after the yes: create each missing or changed routine with `create_trigger` (`create_new_session_on_fire=true`, `initiation=human_request`); a replacement keeps the old `Consolidated from` ids plus the replaced id. Each replaced routine and folded source stays until Verify passes. A `needs_device_approval` result: leave that task and report it.
10. **Test fire** (lesson, 2026-11-18: test fires posted a second daily report, read a one-hour window that could not show the signal, and the thread ended before the old routines were removed). Fire each new routine once with `fire_trigger`; its prompt for that run starts "Test run, not today's report." and reads the routine's real look-back window. Read each run's thread, then report pass or fail per routine, what was switched off or deleted, and the memory saved, in this thread before it ends.
11. **Verify** with `list_triggers`. Leave the clean-up list out of the count. Pass means all of these hold: one enabled routine per kind the project keeps, with the right marker, name, cron, start line and end line; every folded source listed in a `Consolidated from`; no other recurring task in the project; the stream reads back with this `owner_project`. Report pass or fail per check, with ids. All pass: clean up. Any fail: keep every old task and report.
12. **Report** in at most 6 lines: stream, routines created and replaced, verify result, tasks cleaned up. Any task created this run: end with "Set models at claude.ai:" and one line per created task, `<Project> – <Kind> → <model>` (Hourly → Haiku 5.5, SOD and EOD → Sonnet 5.5). Nothing created: skip it. Close with "Re-run /catati:project-setup any time; it changes only what differs."

Setup covers the stream and the routines. Repositories, environments, CLAUDE.md and moving tasks between projects stay with the operator; name them in the report when the operator seems to need them.