import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { matchingAskRule, sharedAskRules } from '../plugins/catati/hooks/ask-rules.mjs';
import { guard } from '../plugins/catati/hooks/guard.mjs';
import { failingChecks, mergeDenial, mergeTargets, originRepo, repoName } from '../plugins/catati/hooks/merge-guard.mjs';
import { OPERATOR } from '../plugins/catati/templates/verifier-record/verifier-record.mjs';

const script = new URL('../plugins/catati/hooks/guard.mjs', import.meta.url).pathname;
const home = '/home/someone';
const askOf = (command) => matchingAskRule({ tool_name: 'Bash', tool_input: { command }, cwd: '/work' }, home);
const editOf = (tool_name, file, cwd = '/work') => matchingAskRule({ tool_name, tool_input: { file_path: file }, cwd }, home);

test('the shared ask list holds the 29 rules, each once', () => {
	assert.equal(sharedAskRules.length, 29);
	assert.equal(new Set(sharedAskRules).size, 29);
});

test('each Bash ask rule family matches its command, also inside a compound command', () => {
	for (const [command, rule] of [
		['gh workflow run deploy.yml -f env=prod', 'Bash(gh workflow run*)'],
		['gh api repos/o/r/actions/workflows/1/dispatches -f ref=main', 'Bash(gh api *dispatches*)'],
		['gh api -X DELETE repos/o/r/git/refs/heads/x', 'Bash(gh api *git/refs*)'],
		['gh api -X PUT repos/o/r/contents/a.txt', 'Bash(gh api *-X*contents/*)'],
		['gh api repos/o/r/contents/a.txt --method PUT', 'Bash(gh api *contents/*--method*)'],
		['gh api repos/o/r/contents/a.txt --input body.json', 'Bash(gh api *contents/*--input*)'],
		['cd x && gh secret set Y', 'Bash(gh secret*)'],
		['ls; gh variable list', 'Bash(gh variable*)'],
		['gh repo edit --visibility public', 'Bash(gh repo edit*)'],
		['gh repo delete o/r --yes', 'Bash(gh repo delete*)'],
		["gh api graphql -f query='mutation { createCommitOnBranch(input: {}) { commit { oid } } }'", 'Bash(gh api *createCommitOnBranch*)'],
		['git -c core.hooksPath=/dev/null commit -m x', 'Bash(git -c *)'],
		['FOO=1 make deploy-prod', 'Bash(make deploy-prod*)'],
		['make migrate ENV=prod', 'Bash(make *ENV=prod*)'],
		['gcloud projects get-iam-policy p', undefined],
		['gcloud iam service-accounts list', 'Bash(gcloud *iam *)'],
		['gcloud beta iam roles list', 'Bash(gcloud *iam *)'],
		['gcloud projects add-iam-policy-binding p --member x', 'Bash(gcloud * add-iam-policy-binding*)'],
		['echo $(gh secret list)', 'Bash(gh secret*)'],
		['(cd web || exit 1) | gh secret delete X', 'Bash(gh secret*)'],
		['true\ngh secret set X', 'Bash(gh secret*)'],
		['if true; then gh secret set X; fi', 'Bash(gh secret*)'],
	])
		assert.equal(askOf(command), rule, command);
});

test('harmless commands and reads match no ask rule', () => {
	for (const command of ['ls -la', 'gh pr view 5', 'gh api repos/o/r/contents/a.txt', 'echo "gh secret set X"', 'git commit -m "git -c x"', 'make deploy-dev', 'grep -rn gh secret docs'])
		assert.equal(askOf(command), undefined, command);
});

test('an edit of a settings file asks, by path suffix or the home settings path', () => {
	assert.equal(editOf('Edit', '/repo/.claude/settings.json'), 'Edit(/.claude/settings.json)');
	assert.equal(editOf('Write', '.claude/settings.local.json', '/repo'), 'Edit(/.claude/settings.local.json)');
	assert.equal(editOf('MultiEdit', `${home}/.claude/settings.json`), 'Edit(/.claude/settings.json)');
	assert.equal(editOf('Edit', '~/.claude/settings.json'), 'Edit(/.claude/settings.json)');
	assert.equal(matchingAskRule({ tool_name: 'NotebookEdit', tool_input: { notebook_path: '/r/.claude/settings.json' } }, home), 'Edit(/.claude/settings.json)');
	assert.equal(editOf('Edit', '/repo/src/settings.json'), undefined);
	assert.equal(editOf('Read', '/repo/.claude/settings.json'), undefined);
});

const repoOf = (target) => ({ ...target, repo: repoName(target.repo, 'catati/catsper') });
const bash = (command) => mergeTargets({ tool_name: 'Bash', tool_input: { command } }, undefined).map(repoOf);
const pull = (number, repo = 'catati/catsper') => ({ repo, number, queued: true });
const direct = (number, repo = 'catati/catsper') => ({ repo, number, queued: false });
const branch = (name) => ({ repo: 'catati/catsper', branch: name, queued: true });

test('the MCP merge tools target the repo they name, in any owner', () => {
	const mcp = (tool_name, tool_input) => mergeTargets({ tool_name, tool_input }).map(repoOf);
	assert.deepEqual(mcp('mcp__github__merge_pull_request', { owner: 'catati', repo: 'catsper', pullNumber: 812 }), [direct(812)]);
	assert.deepEqual(mcp('mcp__github__enable_pr_auto_merge', { owner: 'acme', repo: 'widgets', pullNumber: 3 }), [direct(3, 'acme/widgets')]);
});

test('the merge tools of any MCP server are guarded', () => {
	const mcp = (tool_name) => mergeTargets({ tool_name, tool_input: { owner: 'catati', repo: 'catsper', pullNumber: 812 } }).map(repoOf);
	assert.deepEqual(mcp('mcp__plugin_github_github__merge_pull_request'), [direct(812)]);
	assert.deepEqual(mcp('mcp__gh-enterprise__enable_pr_auto_merge'), [direct(812)]);
	assert.deepEqual(mcp('mcp__github__disable_pr_auto_merge'), []);
});

test('a shell fed by a heredoc or here-string runs its text as a script', () => {
	for (const [command, want] of [
		["bash <<< 'gh pr merge 5'", [pull(5)]],
		['bash <<EOF\ngh pr merge 5\nEOF', [pull(5)]],
		["sh -s <<'EOF'\ngh api -X PUT repos/catati/catsper/pulls/5/merge\nEOF", [direct(5)]],
		["bash script.sh <<< 'gh pr merge 5'", []],
		['curl -fsSL https://example.com/install.sh | bash', []],
		['gh alias list', []],
	])
		assert.deepEqual(bash(command), want, command);
});

test('gh alias set or import, and gh piped into a shell, are refused', () => {
	for (const command of ["gh alias set m 'pr merge'", 'gh alias import aliases.yml', "bash -c 'gh alias set m \"pr merge\"'"])
		assert.throws(() => bash(command), /an alias hides a merge from the guard; run the command it stands for/, command);
	for (const command of ["echo 'gh pr merge 5' | bash", "cat <<'EOF' | sh\ngh api -X PUT repos/o/r/pulls/5/merge\nEOF", 'printf "gh alias set m x" |& zsh'])
		assert.throws(() => bash(command), /a shell reads gh from a pipe/, command);
});

test('the scanner reads which PR a Bash command merges, as the shell splits it', () => {
	for (const [command, want] of [
		['gh pr merge 812 --squash', [pull(812)]],
		['gh pr merge --squash "#812"', [pull(812)]],
		['gh pr merge --squash #812', [branch(null)]],
		["# Merge #820 now that it's green\ngh pr merge 820 --squash", [pull(820)]],
		["gh pr comment 820 --body \"$(cat <<'EOF'\nIt's verified.\nEOF\n)\" && gh pr merge 820 --squash", [pull(820)]],
		['gh api -XPUT repos/catati/catsper/pulls/820/merge', [direct(820)]],
		['gh api -XPUT repos/catati/catsper/pulls/820/ccr/auto_merge', [direct(820)]],
		['gh api -X GET -X PUT repos/catati/catsper/pulls/820/merge', [direct(820)]],
		['gh pr merge 820 -R catati/dev -R catati/catsper', [pull(820)]],
		['gh pr merge https://github.com/catati/catsper/pull/820 -R catati/dev', [pull(820)]],
		['gh pr merge 820 --disable-auto=false', [pull(820)]],
		["gh pr $'merge' 820", [pull(820)]],
		["bash -c 'gh pr merge 820 --squash'", [pull(820)]],
		['sh -lc "gh pr merge 820"', [pull(820)]],
		['eval gh pr merge 820', [pull(820)]],
		['(cd web && gh pr merge 820)', [pull(820)]],
		['# check the PR before gh pr merge\ngh pr view 820', []],
		['gh pr merge --help', []],
		["gh pr comment 820 --body \"$(cat <<'EOF'\nVerified; it's green.\nEOF)\" && gh pr merge 820 --squash", [pull(820)]],
		['gh api 2>/dev/null -X PUT repos/catati/catsper/pulls/820/merge', [direct(820)]],
		['gh pr merge --squash 2>&1 | tail -5', [branch(null)]],
		['gh pr merge 820 > out.txt', [pull(820)]],
		["timeout 120 bash -c 'gh pr merge 820'", [pull(820)]],
		['gh pr merge 820 -R www.github.com/catati/catsper', [pull(820)]],
		['gh api -X PUT repos/{owner}/catsper/pulls/820/merge', [direct(820)]],
		['grep -rn gh "$DIR"', []],
		['gh pr merge 820 --squash -R https://github.com/catati/catsper.git', [pull(820)]],
		['gh pr merge 820 --squash -R git@github.com:catati/catsper.git', [pull(820)]],
		['GH_REPO=https://github.com/catati/catsper.git gh pr merge 820 --squash', [pull(820)]],
		['gh pr merge 820 -R gitlab.com/catati/catsper', [pull(820, null)]],
		['gh api repos/catati/catsper/pulls/$N --jq .head.sha', []],
		['gh api -X DELETE repos/catati/catsper/pulls/820/ccr/auto_merge', []],
		['gh api -X PUT \\\n  repos/catati/catsper/pulls/820/merge \\\n  -f merge_method=squash', [direct(820)]],
		['gh pr merge -st 2 812', [pull(812)]],
		['cd web && gh pr merge 812 --auto && echo done', [pull(812)]],
		['gh pr merge --squash --subject "a && b" 812', [pull(812)]],
		['gh pr --repo catati/catsper merge 820 --squash', [pull(820)]],
		['gh pr merge feature/x --squash', [branch('feature/x')]],
		['gh pr merge 3 -R catati/dev', [pull(3, 'catati/dev')]],
		['GH_REPO=acme/widgets gh pr merge 3', [pull(3, 'acme/widgets')]],
		['gh pr merge 812 && gh pr merge 813', [pull(812), pull(813)]],
		['git log $(gh pr merge 820)', [pull(820)]],
		['gh api --method=PUT /repos/{owner}/{repo}/pulls/812/merge', [direct(812)]],
		['gh api -X PUT repos/:owner/:repo/pulls/812/merge', [direct(812)]],
		['gh api repos/catati/catsper/pulls/812/merge -f merge_method=squash', [direct(812)]],
		['gh api repos/catati/catsper/pulls/812/merge', []],
		['gh api -X GET search/issues -f q=\'is:pr is:merged repo:catati/catsper\'', []],
		["gh api graphql -f query='{ repository(owner: \"catati\", name: \"catsper\") { pullRequest(number: 1) { mergeable } } }'", []],
		["grep -rn 'gh pr merge' docs", []],
		["gh pr create --body 'then gh pr merge 5'", []],
		["cat > notes.md <<'EOF'\ngh pr merge 5\nEOF", []],
		['cat > notes.md <<EOF\n$(gh pr merge 5)\nEOF', [pull(5)]],
		['gh pr merge 820 --admin', [direct(820)]],
		['gh pr merge 820 --admin=false', [pull(820)]],
		['gh pr merge 820 && gh pr merge 820 --admin', [pull(820), direct(820)]],
		["bash -c -eo pipefail 'gh pr merge 5'", [pull(5)]],
		['echo `echo \\`gh pr merge 5\\``', [pull(5)]],
		['{ gh pr merge 820; }', [pull(820)]],
		['if true; then gh pr merge 820; fi', [pull(820)]],
		['(( n = 1 << 3 ))\ngh pr merge 820', [pull(820)]],
		["(( $(g''h pr merge 5) ))", [pull(5)]],
		['cat > notes.md <<EOF\nrun \\`gh pr merge 5\\` by hand\nEOF', []],
		["gh api graphql -f query='mutation { addComment(input: {subjectId: \"x\", body: \"ready to merge\"}) { clientMutationId } }'", []],
	])
		assert.deepEqual(bash(command), want, command);
});

test('a command that may merge but names no readable PR throws', () => {
	for (const command of [
		'gh api -X PUT repos/catati/catsper/pulls/$N/merge',
		'gh pr merge $N --squash',
		'gh pr merge 812 -R $REPO',
		'echo 812 | xargs gh pr merge --squash',
		'export GH_REPO=catati/catsper; gh pr merge 812',
		"gh api graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'",
		'gh api graphql -F query=@merge.graphql',
		'cat <<EOF\nnever closed\ngh pr merge 820',
		'A=merge; gh pr $A 820',
		'G=gh; $G pr merge 820',
		'gh api repos/catati/catsper/merges -f base=main -f head=feature',
	])
		assert.throws(() => bash(command), /cannot tell which PR it merges|never closes holds gh/, command);
});

test('repo names parse from gh values and git remotes', () => {
	assert.equal(repoName(undefined, 'a/b'), 'a/b');
	assert.equal(repoName('{owner}/x', null), null);
	assert.equal(repoName('ssh://git@github.com/a/b.git'), 'a/b');
	assert.equal(originRepo('git@github.com:acme/widgets.git\n'), 'acme/widgets');
	assert.equal(originRepo('http://proxy@127.0.0.1:1234/git/acme/widgets'), 'acme/widgets');
});

test('failingChecks counts a skipped job as passed, a running one as not, and only the latest run', () => {
	assert.deepEqual(
		failingChecks(
			['e2e', 'web', 'record', 'tooling'],
			[
				{ id: 1, name: 'e2e', status: 'completed', conclusion: 'success' },
				{ id: 2, name: 'web', status: 'completed', conclusion: 'skipped' },
				{ id: 3, name: 'tooling', status: 'in_progress', conclusion: null },
			],
			[{ context: 'record', state: 'success' }],
		),
		[{ name: 'tooling', state: 'in_progress' }],
	);
	assert.deepEqual(failingChecks(['api'], [], []), [{ name: 'api', state: 'missing' }]);
	assert.deepEqual(
		failingChecks(
			['e2e'],
			[
				{ id: 5, name: 'e2e', status: 'completed', conclusion: 'success' },
				{ id: 8, name: 'e2e', status: 'completed', conclusion: 'failure' },
			],
			[],
		),
		[{ name: 'e2e', state: 'failure' }],
	);
});

const head = 'a'.repeat(40);
const passOn = (sha = head) => ({ user: { login: OPERATOR }, body: `VERIFIER PASS ${sha}\nall good` });

// The GitHub answers for one PR, keyed by API path, as gh api prints them.
function github({ repo = 'catati/dev', number = 5, comments = [passOn()], behind = 0, queue = false, runs = [{ id: 1, name: 'ci', status: 'completed', conclusion: 'success' }], branch } = {}) {
	const rules = [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'ci' }] } }];
	if (queue) rules.push({ type: 'merge_queue', parameters: {} });
	const table = {
		[`repos/${repo}/pulls/${number}`]: { state: 'open', merged_at: null, head: { sha: head }, base: { ref: 'main' } },
		[`repos/${repo}/issues/${number}/comments`]: comments,
		[`repos/${repo}/rules/branches/main`]: rules,
		[`repos/${repo}/compare/main...${head}`]: { behind_by: behind },
		[`repos/${repo}/commits/${head}/check-runs`]: { total_count: runs.length, check_runs: runs },
		[`repos/${repo}/commits/${head}/status`]: { statuses: [] },
	};
	if (branch) table[`repos/${repo}/pulls?state=open&head=${repo.split('/')[0]}:${encodeURIComponent(branch)}`] = [{ number }];
	return table;
}

const reader = (table) => (path, all) => {
	if (!(path in table)) throw new Error(`gh api ${path} failed: gh: Not Found (HTTP 404)`);
	return all ? [table[path]] : table[path];
};
const nowhere = mkdtempSync(join(tmpdir(), 'catati-guard-nowhere-'));
after(() => rmSync(nowhere, { recursive: true, force: true }));
const deny = (command, table, cwd = nowhere) => mergeDenial({ tool_name: 'Bash', tool_input: { command }, cwd }, reader(table));

test('a merge with no record is denied, naming the missing VERIFIER PASS', () => {
	assert.match(deny('gh pr merge 5 -R catati/dev', github({ comments: [] })), /catati\/dev#5: no VERIFIER PASS by catati-ops names head aaaaaaa/);
	assert.match(deny('gh pr merge 5 -R catati/dev', github({ comments: [passOn('b'.repeat(40))] })), /no VERIFIER PASS/);
	assert.match(deny('gh pr merge 5 -R catati/dev', github({ comments: [{ user: { login: 'someone' }, body: `VERIFIER PASS ${head}` }] })), /no VERIFIER PASS/);
});

test('a merge with a PASS on its head, 0 behind and green checks passes', () => {
	assert.equal(deny('gh pr merge 5 -R catati/dev --squash', github()), undefined);
});

test('a head behind its base is denied', () => {
	assert.match(deny('gh pr merge 5 -R catati/dev', github({ behind: 2 })), /head aaaaaaa is 2 commit\(s\) behind main/);
});

test('under a merge queue, a plain gh pr merge passes behind main, and --admin or the MCP tool is denied', () => {
	assert.equal(deny('gh pr merge 5 -R catati/dev', github({ queue: true, behind: 3 })), undefined);
	assert.match(deny('gh pr merge 5 -R catati/dev --admin', github({ queue: true })), /skips main's merge queue/);
	const mcp = mergeDenial({ tool_name: 'mcp__github__merge_pull_request', tool_input: { owner: 'catati', repo: 'dev', pullNumber: 5 }, cwd: nowhere }, reader(github({ queue: true })));
	assert.match(mcp, /skips main's merge queue/);
});

test('a failing required check is denied', () => {
	assert.match(deny('gh pr merge 5 -R catati/dev', github({ runs: [{ id: 1, name: 'ci', status: 'completed', conclusion: 'failure' }] })), /required check ci is failure on head aaaaaaa/);
	assert.match(deny('gh pr merge 5 -R catati/dev', github({ runs: [] })), /required check ci is missing/);
});

test('a merge whose repo cannot be worked out is denied, saying to add -R', () => {
	assert.match(deny('gh pr merge 3', {}), /cannot tell which repo PR 3 is in; add -R <owner>\/<repo>/);
	assert.match(deny('gh pr merge', {}), /cannot tell which repo the checked-out branch is in/);
});

test('a PR URL, a gh api merge route and a non-catati repo are all guarded', () => {
	assert.match(deny('gh pr merge https://github.com/acme/widgets/pull/7', github({ repo: 'acme/widgets', number: 7, comments: [] })), /acme\/widgets#7: no VERIFIER PASS/);
	assert.match(deny('gh api repos/o/r/pulls/7/merge -X PUT', github({ repo: 'o/r', number: 7, comments: [] })), /o\/r#7: no VERIFIER PASS/);
	assert.equal(deny('gh api repos/o/r/pulls/7/merge -X PUT', github({ repo: 'o/r', number: 7 })), undefined);
});

test('a merge whose repo comes from the cwd is denied when the command changes directory', () => {
	for (const command of [
		'cd /tmp/other && gh pr merge 5',
		'(cd web && gh pr merge 5)',
		'pushd web; gh pr merge 5',
		"bash -c 'cd web' && gh pr merge 5",
		'eval cd web; gh pr merge 5',
		'builtin cd web; gh api -X PUT repos/{owner}/{repo}/pulls/5/merge',
		"bash <<< 'cd web' && gh pr merge 5",
	])
		assert.match(deny(command, {}), /the command changes directory, so add -R <owner>\/<repo>/, command);
	for (const command of ['cd web && gh pr merge 5 -R catati/dev', 'cd web && GH_REPO=catati/dev gh pr merge 5', 'cd web && gh pr merge https://github.com/catati/dev/pull/5', 'cd web && gh api -X PUT repos/catati/dev/pulls/5/merge'])
		assert.equal(deny(command, github()), undefined, command);
});

test('a refused alias or piped gh is denied with the reason', () => {
	assert.match(deny("gh alias set m 'pr merge'", {}), /catati merge guard: an alias hides a merge from the guard/);
	assert.match(deny("echo 'gh pr merge 5' | bash", {}), /catati merge guard: a shell reads gh from a pipe/);
});

test('a GraphQL merge is denied without naming a PR', () => {
	assert.match(deny("gh api graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'", {}), /a GraphQL merge names no PR/);
});

test('a gh failure denies the merge and says why', () => {
	assert.match(deny('gh pr merge 5 -R catati/dev', {}), /cannot check the merge, so it is refused: gh api repos\/catati\/dev\/pulls\/5 failed/);
});

test('a closed PR is denied', () => {
	const table = github();
	table['repos/catati/dev/pulls/5'] = { ...table['repos/catati/dev/pulls/5'], state: 'closed', merged_at: '2026-11-01T00:00:00Z' };
	assert.match(deny('gh pr merge 5 -R catati/dev', table), /catati\/dev#5 is merged already/);
});

test('guard denies before it asks, and asks on input it cannot read', () => {
	const read = reader(github({ comments: [] }));
	assert.equal(guard(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'gh secret list && gh pr merge 5 -R catati/dev' }, cwd: nowhere }), read).hookSpecificOutput.permissionDecision, 'deny');
	assert.equal(guard(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'gh secret list' }, cwd: nowhere }), read).hookSpecificOutput.permissionDecision, 'ask');
	assert.equal(guard('null', read).hookSpecificOutput.permissionDecision, 'ask');
	assert.equal(guard(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: nowhere }), read), undefined);
});

// A fake gh first on PATH answers each repos/ path from a table, and wraps it in a list of pages
// for --slurp, so the hook runs end to end with no network.
function box(t) {
	const parent = mkdtempSync(join(tmpdir(), 'catati-guard-'));
	t.after(() => rmSync(parent, { recursive: true, force: true }));
	const bin = join(parent, 'bin');
	mkdirSync(bin);
	writeFileSync(
		join(bin, 'gh'),
		`#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
const path = args.find((arg) => arg.startsWith('repos/'))
const table = JSON.parse(fs.readFileSync(process.env.FAKE_GH, 'utf8'))
if (!(path in table)) { process.stderr.write('gh: Not Found (HTTP 404)\\n'); process.exit(1) }
process.stdout.write(JSON.stringify(args.includes('--slurp') ? [table[path]] : table[path]))
`,
	);
	chmodSync(join(bin, 'gh'), 0o755);
	const work = join(parent, 'work');
	mkdirSync(work);
	const plain = join(parent, 'plain');
	mkdirSync(plain);
	const env = { PATH: `${bin}:${process.env.PATH}`, HOME: join(parent, 'home'), FAKE_GH: join(parent, 'gh.json'), GIT_CEILING_DIRECTORIES: parent, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
	const git = (...args) => execFileSync('git', args, { cwd: work, env, encoding: 'utf8' });
	git('init', '-q', '-b', 'feature/x');
	git('remote', 'add', 'origin', 'git@github.com:acme/widgets.git');
	const run = (input, table = {}, cwd = plain) => {
		writeFileSync(env.FAKE_GH, JSON.stringify(table));
		const text = typeof input === 'string' ? input : JSON.stringify({ hook_event_name: 'PreToolUse', cwd, ...input });
		const result = spawnSync(process.execPath, [script], { cwd, input: text, encoding: 'utf8', env });
		assert.equal(result.status, 0, result.stderr);
		return result.stdout === '' ? null : JSON.parse(result.stdout).hookSpecificOutput;
	};
	return { work, plain, run, git, home: env.HOME };
}

const bashCall = (command) => ({ tool_name: 'Bash', tool_input: { command } });

test('the hook process asks for a matching command and prints nothing for a harmless one', (t) => {
	const b = box(t);
	assert.deepEqual(b.run(bashCall('cd x && gh secret set Y')), {
		hookEventName: 'PreToolUse',
		permissionDecision: 'ask',
		permissionDecisionReason: 'catati guard: this call matches the shared ask rule Bash(gh secret*).',
	});
	assert.equal(b.run(bashCall('ls -la && git status')), null);
	assert.equal(b.run({ tool_name: 'Edit', tool_input: { file_path: join(b.work, 'README.md') } }), null);
});

test('the hook process asks for an edit of a repo settings file and of the home one', (t) => {
	const b = box(t);
	assert.equal(b.run({ tool_name: 'Edit', tool_input: { file_path: join(b.work, '.claude', 'settings.json') } }).permissionDecision, 'ask');
	const home = b.run({ tool_name: 'Write', tool_input: { file_path: join(b.home, '.claude', 'settings.json') } });
	assert.match(home.permissionDecisionReason, /Edit\(\/\.claude\/settings\.json\)/);
});

test('the hook process asks when its input is not JSON or is empty', (t) => {
	const b = box(t);
	assert.equal(b.run('not json').permissionDecision, 'ask');
	assert.equal(b.run('').permissionDecision, 'ask');
});

test('the hook process denies a merge with no record and lets a verified one through', (t) => {
	const b = box(t);
	const denied = b.run(bashCall('gh pr merge 5 -R catati/dev'), github({ comments: [] }));
	assert.equal(denied.permissionDecision, 'deny');
	assert.match(denied.permissionDecisionReason, /no VERIFIER PASS by catati-ops names head aaaaaaa/);
	assert.equal(b.run(bashCall('gh pr merge 5 -R catati/dev'), github()), null);
});

test('the hook process reads the repo from the cwd origin, and the PR from its checked-out branch', (t) => {
	const b = box(t);
	assert.equal(b.run(bashCall('gh pr merge 9'), github({ repo: 'acme/widgets', number: 9 }), b.work), null);
	assert.equal(b.run(bashCall('gh pr merge --squash'), github({ repo: 'acme/widgets', number: 9, branch: 'feature/x' }), b.work), null);
	const behind = b.run(bashCall('gh pr merge --squash'), github({ repo: 'acme/widgets', number: 9, branch: 'feature/x', behind: 1 }), b.work);
	assert.match(behind.permissionDecisionReason, /acme\/widgets#9: head aaaaaaa is 1 commit\(s\) behind main/);
	assert.match(b.run(bashCall('gh pr merge other'), github({ repo: 'acme/widgets', number: 9 }), b.work).permissionDecisionReason, /gh api repos\/acme\/widgets\/pulls\?state=open/);
});

test('the hook process denies a merge after cd that would read the repo from the cwd', (t) => {
	const b = box(t);
	const table = github({ repo: 'acme/widgets', number: 9 });
	const out = b.run(bashCall(`cd ${b.plain} && gh pr merge 9`), table, b.work);
	assert.equal(out.permissionDecision, 'deny');
	assert.match(out.permissionDecisionReason, /the command changes directory, so add -R <owner>\/<repo>/);
	assert.equal(b.run(bashCall(`cd ${b.plain} && gh pr merge 9 -R acme/widgets`), table, b.work), null);
});

test('the hook process denies a merge from the cwd when it has several GitHub remotes, and uses the one there is', (t) => {
	const b = box(t);
	const table = github({ repo: 'acme/widgets', number: 9 });
	b.git('remote', 'add', 'upstream', 'https://github.com/acme/upstream.git');
	assert.match(b.run(bashCall('gh pr merge 9'), table, b.work).permissionDecisionReason, /this repo has several GitHub remotes, so add -R/);
	assert.equal(b.run(bashCall('gh pr merge 9 -R acme/widgets'), table, b.work), null);
	b.git('remote', 'set-url', 'origin', 'https://gitlab.com/acme/widgets.git');
	b.git('remote', 'set-url', 'upstream', 'git@github.com:acme/widgets.git');
	assert.equal(b.run(bashCall('gh pr merge 9'), table, b.work), null);
});

test('the hook process denies gh pr merge 3 outside a repo, saying to add -R', (t) => {
	const b = box(t);
	const out = b.run(bashCall('gh pr merge 3'));
	assert.equal(out.permissionDecision, 'deny');
	assert.match(out.permissionDecisionReason, /add -R <owner>\/<repo>/);
});

test('the hook process guards the MCP merge tool and denies when gh fails', (t) => {
	const b = box(t);
	const call = { tool_name: 'mcp__github__enable_pr_auto_merge', tool_input: { owner: 'acme', repo: 'widgets', pullNumber: 7 } };
	assert.equal(b.run(call, github({ repo: 'acme/widgets', number: 7 })), null);
	const failed = b.run(call, {});
	assert.equal(failed.permissionDecision, 'deny');
	assert.match(failed.permissionDecisionReason, /cannot check the merge.*HTTP 404/);
});
