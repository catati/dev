# `catati` plugin reference

This repo is a Claude Code plugin marketplace, [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json), with one plugin, `catati`, in [`plugins/catati/`](../plugins/catati/). The plugin sits in a subfolder because claude.ai rejects a plugin with a top-level `bin/`, and this repo had one when the plugin was added.

The operator adds this marketplace at account level on claude.ai, beside the `cursor/plugins` marketplace and its `pstack` plugin. catati/dev does not ship pstack. Account plugins sync into sessions started from the app, not into sessions started through the sessions API ([#25](https://github.com/catati/dev/issues/25)).

A synced plugin holds only its own folder, so the plugin carries the standard itself. The CLI is in [`scripts/catati.mjs`](../plugins/catati/scripts/catati.mjs), its code in [`lib/`](../plugins/catati/lib/), the files it copies in [`templates/`](../plugins/catati/templates/) and the rules in [`conventions/`](../plugins/catati/conventions/). The skill runs the CLI from its own plugin folder and clones nothing, so it still works when catati/dev is private. catati/dev's `make verify` runs the same copy.

| Part | What it does |
| --- | --- |
| [`/catati:setup-dev`](../plugins/catati/skills/setup-dev/SKILL.md) | The plugin's one Catati skill. Its argument picks the job: none or `repo` for repo setup, `project` for project setup, and `start`, `end <kind>`, `sod`, `hourly`, `eod` or `tidy` for a routine step. |
| Repo setup, [`references/repo.md`](../plugins/catati/skills/setup-dev/references/repo.md) | Runs `catati setup` from the plugin in the target repo. Removes the `CLAUDE.md` conventions link, and drops rule-table rows that only restate a convention. Creates missing status labels, and reports how the repo's GitHub settings differ from the conventions. Opens one PR and leaves its body and merge to pstack. |
| Project setup, [`references/project.md`](../plugins/catati/skills/setup-dev/references/project.md) | Sets up a claude.ai project's Focus stream and its SOD, Hourly and EOD routines, and holds the start, end and sync steps each routine calls. The EOD sync backs up and tidies the project's memory. |
| [`catati:agent-browser`](../plugins/catati/skills/agent-browser/SKILL.md) | The skill stub that ships with agent-browser, copied unchanged from the version `env/setup.sh` pins. It sends Claude to `agent-browser skills get core`, which the CLI serves at its own version. |
| SessionStart hook [`session-start.mjs`](../plugins/catati/hooks/session-start.mjs) | Installs `~/.claude/rules/pstack-models.md` when it is missing. Where a repo has a `.githooks` folder and no other `core.hooksPath`, points `core.hooksPath` at it. It acts in each repo of the session: the repo that holds `CLAUDE_PROJECT_DIR` (or the current directory), or else each repo directly below it, as in a project thread that starts in `/home/user`. It prints the shared rules text, [`rules/catati-standard.md`](../plugins/catati/rules/catati-standard.md), with the path of the plugin's conventions, so every session gets the prod rule, the verifier rule and the conventions. Then it prints a line for each problem. |
| PreToolUse hook [`guard.mjs`](../plugins/catati/hooks/guard.mjs) | Guards every session, whatever repo or owner a call targets. It answers "ask" for a call that matches one of the shared ask rules in [`ask-rules.mjs`](../plugins/catati/hooks/ask-rules.mjs), and "deny" for a merge that the merge rule refuses. See [Guards](#guards). |
| WorktreeCreate and WorktreeRemove hook [`worktree.mjs`](../plugins/catati/hooks/worktree.mjs) | Makes `Agent` with `isolation: "worktree"` work where the session starts above the repos. See [Worktree subagents](#worktree-subagents). |

The plugin `version` in `plugins/catati/.claude-plugin/plugin.json` equals the `version` in `package.json`.

## Why the session hooks live in the plugin

Claude Code loads a repo's `.claude/settings.json` only when a session starts in that repo ([settings files](https://code.claude.com/docs/en/settings#settings-files)). A project thread starts one folder up, so it never runs those settings. Plugin hooks load in every session that syncs the plugin ([hooks](https://code.claude.com/docs/en/hooks)). So the hooks that every session needs live in the `catati` plugin, not in each repo.

The control on prod is the rule in [Who changes prod](../plugins/catati/conventions/deploy.md#who-changes-prod), which the SessionStart hook adds to every session. An agent changes prod only when the operator asks for that specific prod action.

## Guards

Plugins cannot ship permission rules or sandbox settings ([plugins reference](https://code.claude.com/docs/en/plugins-reference)), but a plugin hook can answer "ask" or "deny". So the shared rules that every repo carried as `permissions.ask` lines live in the guard hook, and `catati setup` removes those exact lines and catsper's old merge hook from a repo's `.claude/settings.json`. Repo-specific rules, allow and deny lists and the sandbox stay in the repo.

- **Ask rules.** The 29 rules in `sharedAskRules` keep the settings syntax. A Bash rule matches each simple command of the call, the way the shell splits it. An Edit rule matches the `file_path` of an Edit, Write, MultiEdit or NotebookEdit call. When the hook cannot read its input, it answers "ask".
- **Merge rule.** For `gh pr merge`, a `gh api` merge or auto-merge route, and `mcp__github__merge_pull_request` or `mcp__github__enable_pr_auto_merge`, the hook reads the PR through `gh api` and denies unless a `catati-ops` comment whose first line is `VERIFIER PASS <full head SHA>` names the current head, the head is 0 commits behind its base, and the required checks pass. A base with a merge queue passes only a plain `gh pr merge <n>` without `--admin`. A GraphQL merge, a branch-into-branch merge or a call whose repo it cannot work out is denied with the fix. When `gh` cannot reach GitHub, the merge is denied.
- **Which repo.** `-R`, `--repo`, `GH_REPO`, a PR URL, a `gh api repos/<owner>/<repo>/…` path or the MCP tool's `owner` and `repo`. With none, the `origin` of the git repo in the hook's `cwd`. In `/home/user`, a bare `gh pr merge 3` names no repo, so it is denied with "add -R".

## Worktree subagents

In a repo, the hook adds a locked worktree at `<toplevel>/.claude/worktrees/<name>` on branch `worktree-<name>`, as Claude Code does. In a folder that is not a repo, such as `/home/user` in a project thread, it makes `<cwd>/.claude/worktrees/<name>/` with one locked worktree per repo directly below, at the same relative paths.

- Each worktree starts at its repo's `HEAD`, not `origin/HEAD`, so a subagent sees the root's unpushed work.
- Each branch records `catatiBase` and gets `pushRemote=no-push`. That setting stops a bare `git push` only, not `git push origin <ref>`.
- A worktree has no `node_modules`, so a subagent that runs tests runs `make install` first.
- Subagents commit and never push. Only the root pushes.

A `WorktreeCreate` hook replaces Claude Code's own `git worktree` logic in every session, local ones included. Claude Code then skips `.worktreeinclude`. Claude Code also does not call `WorktreeRemove` when a subagent ends, because it cannot tell whether a hook-made worktree holds changes. So the root cleans up after each subagent:

1. Merge the subagent's branch. When two subagents ran in parallel, cherry-pick instead.

	```sh
	git -C <repo> merge --ff-only worktree-<name>
	```

2. Remove the worktree:

	```sh
	node "$(ls -t $(find ~/.claude/plugins -path '*/catati/hooks/worktree.mjs') | head -1)" remove <worktree path>
	```

Remove refuses any path that is not a `…/worktrees/<name>` folder. It deletes a clean worktree on its own `worktree-<name>` branch, and deletes that branch when it has no commits beyond `catatiBase`. Like `git worktree remove`, it deletes ignored files, such as `.env` or `.dev.vars`, in a worktree it counts as clean.

Remove keeps the worktree locked and exits with 1 when the worktree:

- is dirty. An untracked nested repo or worktree counts as dirty.
- holds another worktree of its repo.
- holds a repo or worktree inside an ignored folder.
- is on another branch.

It still removes a worktree whose HEAD reflog holds commits on no branch, such as one an amend replaced, and prints their hashes.
