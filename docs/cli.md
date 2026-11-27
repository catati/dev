# `catati` CLI reference

The CLI has two commands, `check` and `setup`. Both act on the git repo that holds the current directory, so they work from any subdirectory. Both compare the repo with the [`templates/`](../plugins/catati/templates/) folder of the plugin that holds the CLI, so they need no network.

## `catati check`

```text
node plugins/catati/scripts/catati.mjs check
```

`catati check` checks the rules that [`conventions/`](../plugins/catati/conventions/) marks `catati check`.

| Exit code | Meaning |
| --- | --- |
| `0` | No findings. |
| `1` | One or more findings, one per line on stdout, as `<check>: <path>: <problem>`. |
| `2` | The check could not run, for example outside a git repo or on a file it cannot read. One line on stderr says why. |

| Check | Fails when |
| --- | --- |
| `templates-equal` | A file that `catati setup` copies, as [the `catati setup` table](#catati-setup) lists, is missing or differs by a byte from its copy in `templates/`. |
| `make-targets` | The `Makefile` has no `install`, `test`, `e2e`, `verify`, `lint`, `help`, `format` or `staged-check` target, or no `deploy-dev` target in a repo with a `wrangler.jsonc`. The template git hooks call `make staged-check` before a commit and name `make format` when they refuse one. |
| `version-source` | A repo with a `wrangler.jsonc` outside `node_modules/` has no root `package.json`, or its `version` is not `MAJOR.MINOR.PATCH`, such as `2.0.0` (no `v`, no leading zero, no pre-release). Or another `package.json` outside `node_modules/` declares a `version`. The root holds the one version the repo ships. A repo with no `wrangler.jsonc` skips this check. |
| `ci-workflow` | `.github/workflows/ci.yml` is missing. |
| `workflow-names` | A `.yml` or `.yaml` file in `.github/workflows/` is not `ci.yml`, `deploy.yml` or `verifier-record.yml`. Other files there, such as a `README.md`, are not workflows, and no check reads them. |
| `env-names` | See [How `env-names` reads names](#how-env-names-reads-names). |
| `secret-names` | A workflow reads `secrets.<NAME>` where a `_` token of the name is `DEV`, `PROD`, `PRODUCTION`, `DEVELOPMENT`, `STAGING` or `CATATI`. |
| `action-pins` | A `uses:` in a `.yml` or `.yaml` file in `.github/workflows/`, or in an `action.yml` or `action.yaml` under `.github/actions/`, has a ref after `@` that is not a 40-character commit SHA, or has no ref. A trailing comment such as `# v4` is fine. Local actions (`./…`) and `docker://` images are skipped. Each value is reported once per file. |
| `dev-dependency` | A `uses:` in the same files names `catati/dev`, such as a call to its workflows. A repo carries its own copy of the standard's files, which `catati setup` writes. |
| `wrangler-envs` | A `wrangler.jsonc` lacks `env.dev` or `env.prod`, each with a string `name` and `account_id`. Or a command runs a remote Wrangler command without `--env` or `-e`, or runs `wrangler pages deploy` without `--branch`. See [How `wrangler-envs` reads commands](#how-wrangler-envs-reads-commands). Any command that passes `--keep-vars` is also a finding. |
| `prod-workers-dev` | The `env.prod` of a `wrangler.jsonc` outside `node_modules/` does not set `"workers_dev": false`, or sets `preview_urls` to anything but `false`. A file with no `env.prod` is a `wrangler-envs` finding, so this check skips it. Its own name lets a repo allow a prod workers.dev host without turning off `wrangler-envs`. |
| `resource-names` | A resource name in a `wrangler.jsonc`, at the top level or in an `env.<name>`, is not `<repo>` or `<repo>-<component>`, or ends in `-dev`, `-prod`, `-production`, `-development` or `-staging`. `<repo>` is the last part of the `origin` remote URL, without `.git`. A repo with no `origin` remote skips this check. Resource names are `name`, `d1_databases[].database_name`, `r2_buckets[].bucket_name`, `queues.producers[].queue`, `queues.consumers[].queue` and `dead_letter_queue`, and `workflows[].name`. No other key is read, so `vars`, `ratelimits`, `send_email` and `durable_objects` bindings pass. |
| `env-example` | An env template, such as `example.env` or `.env.sample`, is not named `.env.example`. Real env files, such as `.env` and `.prod.env`, are not templates. |
| `allow` | An allow line is expired or malformed, or names no approver. See [Allow lines](#allow-lines). |

### How `env-names` reads names

The check finds four kinds of problem:

- A `wrangler.jsonc` has an `env` key other than `dev` or `prod`.
- A workflow's `environment` is not `dev` or `prod` and does not end in `-dev` or `-prod`. A matrix list is skipped.
- A config file outside `node_modules/` names another environment. The environment words are `production`, `development`, `staging`, `preview` and `qa`, in any case. A config file is `<base>.<word>.<toml|json|jsonc|yaml|yml>`, such as `shopify.app.production.toml`, or `.env.<word>`, `.env.<word>.local` or `.dev.vars.<word>`. For `preview`, only `wrangler.preview.<toml|json|jsonc>`, `shopify.app.preview.<toml|json|jsonc>` and the `.env` and `.dev.vars` forms count.
- A Terraform root outside `node_modules/` and `modules/` is a folder named for one of those words. A Terraform root is a folder that directly holds a `.tf` file.

Other paths, such as `link-preview.vue` or `production-plans.json`, pass.

### How `wrangler-envs` reads commands

The check reads the commands in `package.json` scripts, in a `Makefile`, and in the `deploy_command` and `build_command` of a `builds.json`. A remote Wrangler command is one of these:

- `deploy`, `versions`, `secret`, `triggers` or `rollback`.
- `tail` with no Worker name.
- `d1 migrations apply` without `--local`.
- Any `d1`, `kv` or `r2` command with `--remote`.

The check reads commands this way:

- It skips a command with an argument that is only a variable it cannot expand, such as `$$ENV_ARGS`, because that variable may hold `--env`.
- A variable given as the value of a Wrangler flag, such as `--name ${X}`, does not skip the command.
- In a `Makefile`, it reads only recipe lines, never comments. It expands `$(NAME)` and `${NAME}` from `=`, `:=`, `?=` and `+=` variable lines.
- In every source, it skips `echo` and `printf` commands. It reads the commands inside `(` and `)`, `$(…)`, backticks, and `sh -c`, `bash -c` or `zsh -c`.
- It splits commands at `&&`, `||`, `&`, `;`, `|` and new lines. It reads quotes, so a separator inside a quoted string does not split the command.

## Allow lines

An allow line turns off one check for a time:

```text
# catati-allow(<check>): <reason>; expires YYYY-MM-DD; approved by <name>
```

| Rule | Detail |
| --- | --- |
| Scope | The line turns off its check for every finding in the file that holds it, until the end of the date. It covers the whole file, because some findings have no line of their own, such as a missing `Makefile` target. |
| Approver | `<name>` is the person who allowed the exception, so each exception traces back to a person. A line with no `approved by <name>` is an `allow` finding, including a line written before the approver was required. |
| JSON files | A JSON file holds the line as a string value, such as `"//": "catati-allow(<check>): <reason>; expires YYYY-MM-DD; approved by <name>"` in `package.json`. |
| `.catati-allow` | A file that cannot hold a comment or a string, such as a template or a missing file, takes its line in `.catati-allow` at the repo root, one line per check. A line there turns off its check for the whole repo. |
| Expired or malformed | The line is an `allow` finding and turns off nothing. A date that does not exist, such as `2026-02-31`, makes the line malformed. `catati check` reports these lines in every file a check reads, also when the file has no other finding. |
| Repo checks | A repo's own checks use the same format, such as `catati-allow(commentUse): …`. In any file other than `.catati-allow`, `catati check` skips a line that names a check it does not have, and leaves that line to the repo check that reads it. A misspelled check name in such a file therefore turns off nothing, and `catati check` does not report it. `.catati-allow` holds only `catati check` lines, so an unknown check name there is malformed. |

## `catati setup`

```text
node plugins/catati/scripts/catati.mjs setup [--dry-run]
```

`catati setup` writes the files every Catati repo carries. A run on a repo that is already up to date changes nothing.

| File | What `setup` does |
| --- | --- |
| `.github/ISSUE_TEMPLATE/issue.yml` | Copies `templates/issue.yml`. |
| `.githooks/pre-commit`, `.githooks/pre-push` | Copies `templates/githooks/` and sets the exec bit. |
| `.node-version` | Copies `templates/node-version`, which holds `24`. Repo CI reads it through `node-version-file`. |
| `.github/workflows/verifier-record.yml` | Copies `templates/verifier-record/workflow.yml`. |
| `.github/verifier-record/verifier-record.mjs`, `.github/verifier-record/doors.md` | Copies the script and the one-way-door list from `templates/verifier-record/`. The workflow runs the script, which reads `doors.md` next to itself. |
| `.github/pull_request_template.md` | Deletes it, because catati/dev no longer manages it. |
| `.claude/settings.json` | When present, removes each `permissions.ask` entry that equals one of the plugin's shared ask rules, and any PreToolUse hook that runs `merge-audit.mjs --hook`, because the plugin's guard hook now enforces both. It keeps every other line and its order, and writes only when something changed. |

A copy replaces the whole file when one byte differs, and keeps the file's mode. `setup` does not touch the `Makefile`, `ci.yml`, `.github/CODEOWNERS`, `package.json`, `CLAUDE.md`, or the Biome and tsconfig bases. No ruleset asks for code-owner review, so `CODEOWNERS` enforces nothing, and the operator already merges those paths as [one-way doors](../plugins/catati/conventions/issues-and-prs.md#one-way-door-paths).

`templates/labels.json` holds the four status labels as an array of `name`, `color` and `description` objects. `catati setup` creates no labels from it. `/catati:setup-dev` does.

`setup` prints one line per file, then the findings of `catati check`. Those findings are the changes `setup` does not make.

| Line | Meaning |
| --- | --- |
| `created <path>`, `updated <path>`, `unchanged <path>` | What `setup` did with a managed file. |
| `removed .claude/settings.json ask rule <rule>`, `removed .claude/settings.json hook <command>` | A line `setup` took out of `.claude/settings.json`, followed by `updated .claude/settings.json`. |
| `removed <path>` | `setup` deleted a file it no longer manages. A second run finds none and prints nothing for them. |
| `skipped <path>: <reason>` | `setup` left a managed path as it is, because the path is not a regular file, such as a symlink, or its parent directory, such as `.github`, is a symlink. A link that leads out of the repo reads `skipped <path>: resolves outside the repo`. A link inside the repo is skipped too, because Git commits the link, not the files behind it. A file it would delete is skipped on the same terms. |
| `<check>: <path>: <problem>` | A `catati check` finding that is left after the run. |

| Exit code | Meaning |
| --- | --- |
| `0` | `setup` ran, with or without findings. If it skipped a file, its last line goes to stderr as `catati: setup skipped <n> file(s); the standard is not fully applied`. A caller, such as a skill, reads stderr to learn that a person must look at the skipped files. |
| `2` | `setup` could not run, for example outside a git repo. One line on stderr says why. |

With `--dry-run`, `setup` prints the same lines and writes nothing. The findings then show what a real run would leave.
