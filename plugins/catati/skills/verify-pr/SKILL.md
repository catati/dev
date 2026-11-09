---
name: verify-pr
description: Verify a Catati PR at its exact head SHA with an adversarial verifier on another model family, and post the `Verified at <sha>` comment on a pass. Use for /catati:verify-pr <PR URL>, "verify this PR", or a fresh verdict after a new push.
---

# Verify a PR

Input: one PR URL, `https://github.com/<owner>/<repo>/pull/<n>`. Stop on anything else.

This skill reads, spawns one verifier, files minor gaps as issues and posts at most one comment. It never merges, pushes, approves, requests changes, edits the PR or changes its labels.

GraphQL is blocked. Use `gh api` REST calls.

## 1. Read

1. The PR: `gh api repos/<owner>/<repo>/pulls/<n>`. Keep `state`, `merged`, `title`, `body`, `base.ref` and `head.sha`. The head SHA is the 40-character SHA this run verifies. Call it `<sha>`.
2. The linked issue: each `Closes #<N>` in the body, read with `gh api repos/<owner>/<repo>/issues/<N> --jq .body`. No linked issue is a finding for the verifier, not a stop.
3. The workflow rules: `gh api repos/catati/dev/contents/conventions/workflow.md -H 'Accept: application/vnd.github.raw'`.
4. The commits: `gh api repos/<owner>/<repo>/pulls/<n>/commits --paginate`. Collect the model families that the `Co-Authored-By: Claude <Family> ...` trailers name.

A PR that is not open still gets a verifier, but this run posts no comment. A gap in a merged PR goes to a new issue.

## 2. Pick the verifier model

| Families in the trailers | Verifier `model` |
| --- | --- |
| Opus, or no trailer | `sonnet` |
| Sonnet only | `opus` |
| Opus and Sonnet | Stop and report. No family is independent of both. |

## 3. Spawn the verifier

Spawn one subagent with the `Agent` tool: `subagent_type: "general-purpose"`, the `model` from step 2, and the brief below as the prompt, every `<placeholder>` filled. Wait for its report. Do not run a second verifier to overrule the first.

Run this skill in a session that has the `Agent` tool and the repo attached. A subagent has no `Agent` tool. Auto mode refuses a headless `claude -p`. A child session from `create_session` has no GitHub access to the repo, and auto mode refuses to run code it clones. Without the `Agent` tool, stop and report that the caller must spawn the verifier.

````text
You are an adversarial verifier for <PR URL>. Your job is to find what is wrong with it, not to approve it.
Goal of the PR: <the issue's What and Why, one or two sentences>.
Verify at head SHA <sha>, exactly. Base branch: <base.ref>.
Linked issue <issue URL>. Its acceptance criteria:
<the issue's Acceptance criteria, verbatim>

Rules:
- Read only. Do not push, comment, label, approve, merge or edit the PR or any issue. Change files only in your own scratch checkouts.
- Credentials and env files stay unread and out of your report.
- A step you cannot run is a finding, not a pass. Name the command and its error.

Do each step and keep its command and output:

1. Check out. In the session's own checkout of <owner>/<repo>, run `git fetch origin pull/<n>/head <base.ref>`, then `git worktree add --detach <scratch>/head <sha>` and `git worktree add --detach <scratch>/base origin/<base.ref>`, with <scratch> a new directory. Run every later step in those two worktrees, called `head` and `base` below. Confirm `git -C head rev-parse HEAD` prints <sha>. If not, stop with FAIL.
2. Scope. `git -C head diff --stat origin/<base.ref>...<sha>`. Each changed file must serve the issue. Name each file outside its What to build.
3. Acceptance criteria. Reproduce each one yourself, with your own commands or scratch inputs. Do not trust the PR's Evidence section. Mark each criterion proven, failed or unproven.
4. Tests. Install the repo as its README or Makefile says and run its tests in `head` (`npm test`, `make verify` or the repo's equivalent). Paste the summary line.
5. Mutation. Pick two rules the change adds or relies on. Break each one in `head`, one at a time, run the tests, and show that at least one test fails. Restore each with `git -C head checkout -- .` and show the suite is green again. A mutation that no test catches is a finding.
6. Break it. Try to defeat the change as a hostile author or user would. For a gate or check, the goal is a false pass: an exit 0 on input it must reject. Try at least:
   - inputs: empty, huge, unicode, control characters, letter case, paths with `..`, symlinks, renames, deletions;
   - environment: `PATH`, `HOME`, `NODE_OPTIONS`, `LC_ALL`, any `GIT_*` variable, running from a subdirectory or outside the repo;
   - config: `.gitattributes`, `git config` keys such as `core.*` and `diff.*`, repo-local config files the code reads;
   - the gate's own code: can the PR change what the gate runs, so it passes itself?
   Show each attempt's command and result.
7. PR format. Run `check-pr` from the base checkout, never from `head`, since the PR could edit it to pass itself. Write the PR title and body to files from `gh api repos/<owner>/<repo>/pulls/<n> --jq .title` and `--jq .body`. In catati/dev, run `PR_TITLE="$(cat title)" PR_BODY="$(cat body)" node base/bin/catati.mjs check-pr`. Elsewhere, install `base` and run `base/node_modules/.bin/catati check-pr` the same way. Paste its output and exit code.

Severity:
- blocker: an acceptance criterion fails, or the change is unsafe to merge, such as a false pass in a gate or a leaked credential.
- major: a real defect, or an acceptance criterion left unproven.
- minor: safe to land and fix later, such as a docs gap or a missing test that hides no defect.

Verdict: FAIL with any blocker or major finding. PASS WITH GAPS with only minor findings. PASS with none.

Report in this order:
1. One line: `Verdict: PASS`, `Verdict: PASS WITH GAPS` or `Verdict: FAIL`.
2. One line: `Model: <your exact model ID>`.
3. Each finding: severity, title, file:line, the reproduction command and its output.
4. What you checked and found fine, one line each, with the command.
````

## 4. Decide

1. Read the verifier's verdict line. A report without one is a FAIL.
2. Read `head.sha` again. If it differs from `<sha>`, the verdict is stale. Post nothing and report.
3. FAIL, or PASS WITH GAPS with any gap above minor: post nothing, file nothing, and go to step 7.
4. A PR that is not open: file the gaps as in step 5, post nothing, and go to step 7.

## 5. File each minor gap

1. List the open issues: `gh api 'repos/<owner>/<repo>/issues?state=open&per_page=100' --paginate`. A gap already filed has an issue whose body holds `Found by /catati:verify-pr on #<n>` and the same title. Reuse it.
2. Otherwise open one issue per gap with `gh api repos/<owner>/<repo>/issues -f title=... -f body=... -f 'labels[]=todo'`.
   - Title: `<area>: <outcome>`, the outcome a plain imperative action a person notices.
   - Body: the `Card`, `What to build`, `Acceptance criteria` and `Blocked by` sections of the repo's issue form, then the line `Found by /catati:verify-pr on #<n> at <sha>.` and the verifier's reproduction.

## 6. Post the verified comment

1. List the PR's comments: `gh api repos/<owner>/<repo>/issues/<n>/comments --paginate`. If one already starts with the line `Verified at <sha>`, post nothing.
2. Otherwise write this body to a file and post it with `gh api repos/<owner>/<repo>/issues/<n>/comments -F body=@<file>`:

   ```text
   Verified at <sha>

   Verdict: <PASS or PASS WITH GAPS>
   Verifier: <model from step 2> (<the verifier's Model line>), author <families from step 1>
   Gaps filed: <#N links, or None>
   ```

The first line matches `^Verified at [0-9a-f]{40}$`, as `conventions/workflow.md` in catati/dev states. Keep it exactly that: the full lowercase SHA, no Markdown, nothing after it.

## 7. Report

Reply with:

- the PR URL and `<sha>`;
- the verifier model and its verdict line;
- each finding with its severity, file:line and reproduction;
- the gap issues filed or reused;
- the comment URL, or why no comment was posted.
