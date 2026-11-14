# Repo settings

These settings live in GitHub, not in a repo's files. The operator changes them in the repo's Settings. Agents read them and report a difference from this page, and change none of them.

| Setting | Rule | Check |
| --- | --- | --- |
| Dependabot alerts | On. | judgment |
| Dependabot security updates | On. | judgment |
| Dependabot version updates | Not part of the standard, so no template adds `.github/dependabot.yml`. A repo may keep its own. Each npm bump changes `package.json`, a one-way-door path, so each bump waits for the operator. | judgment |
| Branch rulesets | `main` and `check`, as [branches.md](branches.md#rulesets) says. | judgment |
| GitHub environment `prod` | Requires the operator's review, as [deploy.md](deploy.md#the-deploy-prod-job) says. | judgment |
| Status labels | The four labels in `templates/labels.json` exist, as [naming.md](naming.md#titles-and-labels) says. | judgment |
