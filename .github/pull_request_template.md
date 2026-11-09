## Why

<!-- The problem this change solves and the approach, in one to three plain sentences. -->

> [!NOTE]
> **What:** <!-- What changes for a person, and why, in one plain sentence; the PR's label says where it stands. -->

Closes #

### What changes

<!-- Two to four plain bullets a person notices, with no code names; one relevant emoji each is optional. -->

- ...

### Risk

| Undo | Touches |
| --- | --- |
| ↩️ ... | ... |

<details>
<summary><b>Details for reviewers</b> · summary, evidence, guards, merge danger</summary>

## Summary

<!-- The smallest view that makes the change clear: a diagram, diff sketch or tree, as /pr writes it. -->

## Evidence

<!-- Map the acceptance criteria to independent proof. -->
<!-- UI: include the dev screenshot plus the relevant accessibility tree, console and computed-value check. -->
<!-- Non-UI: cite the relevant test, check, measurement or documentation diff. -->

- ...

## Guards

<!-- One line per accepted finding: `- <finding> → <rung>: <artefact or #N>`, or `- <finding> → one-off: <reason>`. -->
<!-- Write None when the PR has no accepted finding. -->

## Merge Danger

**Door:** `two-way`

<!-- Use `two-way` when reverting the code restores the previous behaviour. -->
<!-- Use `one-way` when persistent or external state can remain after a revert. -->

**Blast Radius:** `...`

<!-- Name the smallest affected surface, for example: docs only, the review job, every project's build. -->

</details>
