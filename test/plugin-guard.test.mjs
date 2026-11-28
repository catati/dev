import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { matchingAskRule, sharedAskRules } from '../plugins/catati/hooks/ask-rules.mjs';
import { guard } from '../plugins/catati/hooks/guard.mjs';
import { mergeDecision, mergeTargets, originRepo, repoName } from '../plugins/catati/hooks/merge-guard.mjs';
import { OPERATOR } from '../plugins/catati/templates/verifier-record/verifier-record.mjs';

const script = new URL('../plugins/catati/hooks/guard.mjs', import.meta.url).pathname;
const home = '/home/someone';
const askOf = (command) => matchingAskRule({ tool_name: 'Bash', tool_input: { command }, cwd: '/work' }, home);
const editOf = (tool_name, file, cwd = '/work') => matchingAskRule({ tool_name, tool_input: { file_path: file }, cwd }, home);

test('the shared ask list holds only the 13 dangerous rules, each once', () => {
	assert.deepEqual(sharedAskRules, [
		'Bash(make deploy-prod*)',
		'Bash(make *ENV=prod*)',
		'Bash(gh secret set*)',
		'Bash(gh secret delete*)',
		'Bash(gh variable set*)',
		'Bash(gh variable delete*)',
		'Bash(gh repo delete*)',
		'Bash(gh repo edit*)',
		'Bash(gh api *git/refs/heads/main*)',
		'Bash(gcloud * add-iam-policy-binding*)',
		'Bash(gcloud * remove-iam-policy-binding*)',
		'Edit(/.claude/settings.local.json)',
		'Edit(~/.claude/settings.json)',
	]);
});

test('each Bash ask rule matches its command, also inside a compound command', () => {
	for (const [command, rule] of [
		['FOO=1 make deploy-prod', 'Bash(make deploy-prod*)'],
		['make migrate ENV=prod', 'Bash(make *ENV=prod*)'],
		['cd x && gh secret set Y', 'Bash(gh secret set*)'],
		['gh secret delete Y', 'Bash(gh secret delete*)'],
		['ls; gh variable set V --body 1', 'Bash(gh variable set*)'],
		['gh variable delete V', 'Bash(gh variable delete*)'],
		['gh repo edit --visibility public', 'Bash(gh repo edit*)'],
		['gh repo delete o/r --yes', 'Bash(gh repo delete*)'],
		['gcloud projects add-iam-policy-binding p --member x', 'Bash(gcloud * add-iam-policy-binding*)'],
		['gcloud projects remove-iam-policy-binding p --member x', 'Bash(gcloud * remove-iam-policy-binding*)'],
		['echo $(gh secret set X)', 'Bash(gh secret set*)'],
		['(cd web || exit 1) | gh secret delete X', 'Bash(gh secret delete*)'],
		['true\ngh secret set X', 'Bash(gh secret set*)'],
		['if true; then gh secret set X; fi', 'Bash(gh secret set*)'],
	])
		assert.equal(askOf(command), rule, command);
});

test("a gh api call on main's ref asks only when it writes", () => {
	const rule = 'Bash(gh api *git/refs/heads/main*)';
	for (const command of [
		'gh api -X PATCH repos/o/r/git/refs/heads/main -f sha=abc',
		'gh api -XPATCH repos/o/r/git/refs/heads/main',
		'gh api --method=DELETE repos/o/r/git/refs/heads/main',
		'gh api repos/o/r/git/refs/heads/main -F force=true',
		'gh api repos/o/r/git/refs/heads/main --field sha=abc',
		'gh api --input body.json repos/o/r/git/refs/heads/main',
		'gh api -X $M repos/o/r/git/refs/heads/main',
	])
		assert.equal(askOf(command), rule, command);
	for (const command of ['gh api repos/o/r/git/refs/heads/main', 'gh api repos/o/r/git/refs/heads/main --jq .object.sha', 'gh api -X GET repos/o/r/git/refs/heads/main -f per_page=1', 'gh api -X PATCH repos/o/r/git/refs/heads/feature -f sha=abc'])
		assert.equal(askOf(command), undefined, command);
});

// The calls a poteto-mode run makes all the time; none of them asks.
const everyday = ['git -c user.name=x commit -m y', 'gh workflow run ci.yml', 'gh secret list', 'gh variable list', 'gh api repos/o/r/contents/a', 'gh api -X PUT repos/o/r/contents/a -f content=x', 'gh api repos/o/r/git/refs/heads/main', 'gh pr view 3', 'gh pr create', 'gcloud iam service-accounts list'];

test('reads, workflow runs and everyday commands match no ask rule', () => {
	for (const command of [...everyday, 'ls -la', 'echo "gh secret set X"', 'git commit -m "gh secret set x"', 'make deploy-dev', 'grep -rn gh secret docs'])
		assert.equal(askOf(command), undefined, command);
});

test('an edit of the local settings or the home settings asks, and of a repo settings file does not', () => {
	assert.equal(editOf('Write', '.claude/settings.local.json', '/repo'), 'Edit(/.claude/settings.local.json)');
	assert.equal(editOf('MultiEdit', `${home}/.claude/settings.json`), 'Edit(~/.claude/settings.json)');
	assert.equal(editOf('Edit', '~/.claude/settings.json'), 'Edit(~/.claude/settings.json)');
	assert.equal(matchingAskRule({ tool_name: 'NotebookEdit', tool_input: { notebook_path: '/r/.claude/settings.local.json' } }, home), 'Edit(/.claude/settings.local.json)');
	assert.equal(editOf('Edit', '/repo/.claude/settings.json'), undefined);
	assert.equal(editOf('Edit', '/repo/src/settings.json'), undefined);
	assert.equal(editOf('Read', '/repo/.claude/settings.local.json'), undefined);
});

const repoOf = ({ dir, ...target }) => ({ ...target, repo: repoName(target.repo, 'catati/catsper') });
const bash = (command) => mergeTargets({ tool_name: 'Bash', tool_input: { command }, cwd: '/work' }, undefined).map(repoOf);
const pull = (number, repo = 'catati/catsper') => ({ repo, number });
const branch = (name) => ({ repo: 'catati/catsper', branch: name });

test('the MCP merge tools target the repo they name, in any owner', () => {
	const mcp = (tool_name, tool_input) => mergeTargets({ tool_name, tool_input }).map(repoOf);
	assert.deepEqual(mcp('mcp__github__merge_pull_request', { owner: 'catati', repo: 'catsper', pullNumber: 812 }), [pull(812)]);
	assert.deepEqual(mcp('mcp__github__enable_pr_auto_merge', { owner: 'acme', repo: 'widgets', pullNumber: 3 }), [pull(3, 'acme/widgets')]);
});

test('the merge tools of any MCP server are guarded', () => {
	const mcp = (tool_name) => mergeTargets({ tool_name, tool_input: { owner: 'catati', repo: 'catsper', pullNumber: 812 } }).map(repoOf);
	assert.deepEqual(mcp('mcp__plugin_github_github__merge_pull_request'), [pull(812)]);
	assert.deepEqual(mcp('mcp__gh-enterprise__enable_pr_auto_merge'), [pull(812)]);
	assert.deepEqual(mcp('mcp__github__disable_pr_auto_merge'), []);
});

test('a shell fed by a heredoc or here-string runs its text as a script', () => {
	for (const [command, want] of [
		["bash <<< 'gh pr merge 5'", [pull(5)]],
		['bash <<EOF\ngh pr merge 5\nEOF', [pull(5)]],
		["sh -s <<'EOF'\ngh api -X PUT repos/catati/catsper/pulls/5/merge\nEOF", [pull(5)]],
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
		['gh api -XPUT repos/catati/catsper/pulls/820/merge', [pull(820)]],
		['gh api -XPUT repos/catati/catsper/pulls/820/ccr/auto_merge', [pull(820)]],
		['gh api -X GET -X PUT repos/catati/catsper/pulls/820/merge', [pull(820)]],
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
		['gh api 2>/dev/null -X PUT repos/catati/catsper/pulls/820/merge', [pull(820)]],
		['gh pr merge --squash 2>&1 | tail -5', [branch(null)]],
		['gh pr merge 820 > out.txt', [pull(820)]],
		["timeout 120 bash -c 'gh pr merge 820'", [pull(820)]],
		['gh pr merge 820 -R www.github.com/catati/catsper', [pull(820)]],
		['gh api -X PUT repos/{owner}/catsper/pulls/820/merge', [pull(820)]],
		['grep -rn gh "$DIR"', []],
		['gh pr merge 820 --squash -R https://github.com/catati/catsper.git', [pull(820)]],
		['gh pr merge 820 --squash -R git@github.com:catati/catsper.git', [pull(820)]],
		['GH_REPO=https://github.com/catati/catsper.git gh pr merge 820 --squash', [pull(820)]],
		['gh pr merge 820 -R gitlab.com/catati/catsper', [pull(820, null)]],
		['gh api repos/catati/catsper/pulls/$N --jq .head.sha', []],
		['gh api -X DELETE repos/catati/catsper/pulls/820/ccr/auto_merge', []],
		['gh api -X PUT \\\n  repos/catati/catsper/pulls/820/merge \\\n  -f merge_method=squash', [pull(820)]],
		['gh pr merge -st 2 812', [pull(812)]],
		['cd web && gh pr merge 812 --auto && echo done', [pull(812)]],
		['gh pr merge --squash --subject "a && b" 812', [pull(812)]],
		['gh pr --repo catati/catsper merge 820 --squash', [pull(820)]],
		['gh pr merge feature/x --squash', [branch('feature/x')]],
		['gh pr merge 3 -R catati/dev', [pull(3, 'catati/dev')]],
		['GH_REPO=acme/widgets gh pr merge 3', [pull(3, 'acme/widgets')]],
		['gh pr merge 812 && gh pr merge 813', [pull(812), pull(813)]],
		['git log $(gh pr merge 820)', [pull(820)]],
		['gh api --method=PUT /repos/{owner}/{repo}/pulls/812/merge', [pull(812)]],
		['gh api -X PUT repos/:owner/:repo/pulls/812/merge', [pull(812)]],
		['gh api repos/catati/catsper/pulls/812/merge -f merge_method=squash', [pull(812)]],
		['gh api repos/catati/catsper/pulls/812/merge', []],
		['gh api -X GET search/issues -f q=\'is:pr is:merged repo:catati/catsper\'', []],
		["gh api graphql -f query='{ repository(owner: \"catati\", name: \"catsper\") { pullRequest(number: 1) { mergeable } } }'", []],
		["grep -rn 'gh pr merge' docs", []],
		["gh pr create --body 'then gh pr merge 5'", []],
		["cat > notes.md <<'EOF'\ngh pr merge 5\nEOF", []],
		['cat > notes.md <<EOF\n$(gh pr merge 5)\nEOF', [pull(5)]],
		['gh pr merge 820 --admin', [pull(820)]],
		['gh pr merge 820 --admin=false', [pull(820)]],
		['gh pr merge 820 && gh pr merge 820 --admin', [pull(820), pull(820)]],
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

test('a command that may merge but names no readable PR throws for an ask, and a hidden merge for a deny', () => {
	for (const command of [
		'gh api -X PUT repos/catati/catsper/pulls/$N/merge',
		'gh pr merge $N --squash',
		'gh pr merge 812 -R $REPO',
		'echo 812 | xargs gh pr merge --squash',
		'export GH_REPO=catati/catsper; gh pr merge 812',
		'gh api graphql -F query=@merge.graphql',
		'A=merge; gh pr $A 820',
		'G=gh; $G pr merge 820',
	])
		assert.throws(() => bash(command), (error) => error.decision === 'ask' && /cannot tell which PR it merges/.test(error.message), command);
	assert.throws(() => bash('cat <<EOF\nnever closed\ngh pr merge 820'), /never closes holds gh/);
	assert.throws(() => bash("gh api graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'"), (error) => error.decision === 'deny' && /a GraphQL merge names no PR/.test(error.message));
	assert.throws(() => bash('gh api repos/catati/catsper/merges -f base=main -f head=feature'), (error) => error.decision === 'deny' && /a merge of one branch into another skips the PR/.test(error.message));
});

const dirs = (command, home = '/home/me') => mergeTargets({ tool_name: 'Bash', tool_input: { command }, cwd: '/home/user' }, undefined, home).map((target) => target.dir);

test('a cd or pushd before a merge moves the directory its repo is read from, in order and per subshell', () => {
	for (const [command, want] of [
		['cd dev && gh pr merge 141', ['/home/user/dev']],
		['gh pr merge 1 && cd dev', ['/home/user']],
		['cd /tmp && cd x; gh pr merge 1', ['/tmp/x']],
		['cd dev/web && cd .. && gh pr merge 1', ['/home/user/dev']],
		['cd ~/r && gh pr merge 1', ['/home/me/r']],
		['cd ~ && gh pr merge 1', ['/home/me']],
		['cd && gh pr merge 1', ['/home/me']],
		['builtin cd -P dev && gh pr merge 1', ['/home/user/dev']],
		['cd -- dev && gh pr merge 1', ['/home/user/dev']],
		['(cd web && gh pr merge 1); gh pr merge 2', ['/home/user/web', '/home/user']],
		['echo $(cd web) && gh pr merge 1', ['/home/user']],
		["bash -c 'cd web' && gh pr merge 1", ['/home/user']],
		["bash -c 'cd web && gh pr merge 1'", ['/home/user/web']],
		['eval cd web; gh pr merge 1', ['/home/user/web']],
		['pushd web; popd; gh pr merge 1', ['/home/user']],
		['pushd web && gh pr merge 1', ['/home/user/web']],
		['cd $D && gh pr merge 1', [null]],
		['cd "$(git rev-parse --show-toplevel)" && gh pr merge 1', [null]],
		['cd - && gh pr merge 1', [null]],
		['cd ~other && gh pr merge 1', [null]],
		['popd && gh pr merge 1', [null]],
		['cd $D && cd /abs && gh pr merge 1', ['/abs']],
	])
		assert.deepEqual(dirs(command), want, command);
	assert.deepEqual(dirs('cd && gh pr merge 1', ''), [null]);
	assert.deepEqual(dirs('cd ~/x && gh pr merge 1', ''), [null]);
});

test('repo names parse from gh values and git remotes', () => {
	assert.equal(repoName(undefined, 'a/b'), 'a/b');
	assert.equal(repoName('{owner}/x', null), null);
	assert.equal(repoName('ssh://git@github.com/a/b.git'), 'a/b');
	assert.equal(originRepo('git@github.com:acme/widgets.git\n'), 'acme/widgets');
	assert.equal(originRepo('http://proxy@127.0.0.1:1234/git/acme/widgets'), 'acme/widgets');
});

const head = 'a'.repeat(40);
const passOn = (sha = head) => ({ user: { login: OPERATOR }, body: `VERIFIER PASS ${sha}\nall good` });

// The GitHub answers for one PR, keyed by API path, as gh api prints them.
function github({ repo = 'catati/dev', number = 5, comments = [passOn()], state = 'open', branch } = {}) {
	const table = {
		[`repos/${repo}/pulls/${number}`]: { state, merged_at: state === 'closed' ? '2026-11-01T00:00:00Z' : null, head: { sha: head }, base: { ref: 'main' } },
		[`repos/${repo}/issues/${number}/comments`]: comments,
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
const check = (command, table, cwd = nowhere, home = '/home/me') => mergeDecision({ tool_name: 'Bash', tool_input: { command }, cwd }, reader(table), home);
const denied = (command, table, cwd) => {
	const answer = check(command, table, cwd);
	assert.equal(answer?.decision, 'deny', command);
	return answer.reason;
};
const asked = (command, table, cwd, home) => {
	const answer = check(command, table, cwd, home);
	assert.equal(answer?.decision, 'ask', command);
	return answer.reason;
};

test('a merge with no record, a record on another head or by someone else, or a later FAIL is denied', () => {
	assert.match(denied('gh pr merge 5 -R catati/dev', github({ comments: [] })), /catati\/dev#5: no VERIFIER PASS by catati-ops names head aaaaaaa/);
	assert.match(denied('gh pr merge 5 -R catati/dev', github({ comments: [passOn('b'.repeat(40))] })), /no VERIFIER PASS/);
	assert.match(denied('gh pr merge 5 -R catati/dev', github({ comments: [{ user: { login: 'someone' }, body: `VERIFIER PASS ${head}` }] })), /no VERIFIER PASS/);
	assert.match(denied('gh pr merge 5 -R catati/dev', github({ comments: [passOn(), { user: { login: OPERATOR }, body: `VERIFIER FAIL ${head}` }] })), /latest record by catati-ops on head aaaaaaa is a VERIFIER FAIL/);
});

test('a PASS on the head is all a merge needs: --admin, --auto and the MCP tool pass, and nothing else is read', () => {
	for (const command of ['gh pr merge 5 -R catati/dev --squash', 'gh pr merge 5 -R catati/dev --admin', 'gh pr merge 5 -R catati/dev --auto', 'gh api -X PUT repos/catati/dev/pulls/5/merge'])
		assert.equal(check(command, github()), undefined, command);
	assert.equal(mergeDecision({ tool_name: 'mcp__github__merge_pull_request', tool_input: { owner: 'catati', repo: 'dev', pullNumber: 5 }, cwd: nowhere }, reader(github())), undefined);
});

test('a closed or merged PR gets no answer, since gh reports it', () => {
	assert.equal(check('gh pr merge 5 -R catati/dev', github({ state: 'closed', comments: [] })), undefined);
});

test('a merge whose repo cannot be worked out asks, saying to add -R', () => {
	assert.match(asked('gh pr merge 3', {}), /cannot tell which repo PR 3 is in; add -R <owner>\/<repo>/);
	assert.match(asked('gh pr merge', {}), /cannot tell which repo the checked-out branch is in/);
	assert.match(asked('gh pr merge $N', {}), /its PR or repo is a variable/);
});

test('a merge after a cd the guard cannot follow asks, and one that names its repo does not', () => {
	for (const command of ['cd $D && gh pr merge 5', 'cd - && gh pr merge 5', 'popd; gh api -X PUT repos/{owner}/{repo}/pulls/5/merge'])
		assert.match(asked(command, {}), /a cd before the merge goes to a directory the guard cannot work out, so add -R/, command);
	assert.match(asked('cd && gh pr merge 5', {}, nowhere, ''), /a cd before the merge/);
	for (const command of ['cd $D && gh pr merge 5 -R catati/dev', 'cd - && GH_REPO=catati/dev gh pr merge 5', 'cd $D && gh pr merge https://github.com/catati/dev/pull/5', 'cd $D && gh api -X PUT repos/catati/dev/pulls/5/merge'])
		assert.equal(check(command, github()), undefined, command);
});

test('a PR URL, a gh api merge route and a non-catati repo are all guarded', () => {
	assert.match(denied('gh pr merge https://github.com/acme/widgets/pull/7', github({ repo: 'acme/widgets', number: 7, comments: [] })), /acme\/widgets#7: no VERIFIER PASS/);
	assert.match(denied('gh api repos/o/r/pulls/7/merge -X PUT', github({ repo: 'o/r', number: 7, comments: [] })), /o\/r#7: no VERIFIER PASS/);
	assert.equal(check('gh api repos/o/r/pulls/7/merge -X PUT', github({ repo: 'o/r', number: 7 })), undefined);
});

test('an alias, piped gh, a GraphQL merge and a branch merge are denied with the reason', () => {
	assert.match(denied("gh alias set m 'pr merge'", {}), /catati merge guard: an alias hides a merge from the guard/);
	assert.match(denied("echo 'gh pr merge 5' | bash", {}), /catati merge guard: a shell reads gh from a pipe/);
	assert.match(denied("gh api graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'", {}), /a GraphQL merge names no PR/);
	assert.match(denied('gh api repos/o/r/merges -f base=main -f head=x', {}), /a merge of one branch into another skips the PR/);
});

test('a PR or comments gh cannot read asks and says why', () => {
	assert.match(asked('gh pr merge 5 -R catati/dev', {}), /cannot check the merge, so it asks: cannot read catati\/dev#5: gh api repos\/catati\/dev\/pulls\/5 failed/);
	const table = github();
	delete table['repos/catati/dev/issues/5/comments'];
	assert.match(asked('gh pr merge 5 -R catati/dev', table), /gh api repos\/catati\/dev\/issues\/5\/comments failed/);
});

test('a missing record denies even when another merge in the call asks', () => {
	assert.match(denied('gh pr merge 5 -R catati/dev && gh pr merge 3', github({ comments: [] })), /no VERIFIER PASS/);
});

test('guard denies a merge with no record, asks for a dangerous call or input it cannot read, and is silent otherwise', () => {
	const read = reader(github({ comments: [] }));
	const answer = (command) => guard(JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: nowhere }), read)?.hookSpecificOutput.permissionDecision;
	assert.equal(answer('gh secret set X && gh pr merge 5 -R catati/dev'), 'deny');
	assert.equal(answer('gh secret set X'), 'ask');
	assert.equal(guard('null', read).hookSpecificOutput.permissionDecision, 'ask');
	for (const command of ['ls', ...everyday]) assert.equal(answer(command), undefined, command);
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
	const run = (input, table = {}, cwd = plain, extra = {}) => {
		writeFileSync(env.FAKE_GH, JSON.stringify(table));
		const text = typeof input === 'string' ? input : JSON.stringify({ hook_event_name: 'PreToolUse', cwd, ...input });
		const result = spawnSync(process.execPath, [script], { cwd, input: text, encoding: 'utf8', env: { ...env, ...extra } });
		assert.equal(result.status, 0, result.stderr);
		return result.stdout === '' ? null : JSON.parse(result.stdout).hookSpecificOutput;
	};
	return { parent, work, plain, run, git, home: env.HOME };
}

const bashCall = (command) => ({ tool_name: 'Bash', tool_input: { command } });

test('the hook process asks for a dangerous command and prints nothing for a harmless one', (t) => {
	const b = box(t);
	assert.deepEqual(b.run(bashCall('cd x && gh secret set Y')), {
		hookEventName: 'PreToolUse',
		permissionDecision: 'ask',
		permissionDecisionReason: 'catati guard: this call matches the shared ask rule Bash(gh secret set*).',
	});
	assert.equal(b.run(bashCall('ls -la && git status')), null);
	assert.equal(b.run({ tool_name: 'Edit', tool_input: { file_path: join(b.work, 'README.md') } }), null);
});

test('the hook process prints nothing for the commands a poteto-mode run makes, a verified merge after cd included', (t) => {
	const b = box(t);
	const table = github({ repo: 'acme/widgets', number: 9 });
	for (const command of [...everyday, 'cd work && gh pr merge 9']) assert.equal(b.run(bashCall(command), table, b.parent), null, command);
});

test('the hook process asks for an edit of the local settings and of the home ones, not of the repo settings', (t) => {
	const b = box(t);
	assert.equal(b.run({ tool_name: 'Edit', tool_input: { file_path: join(b.work, '.claude', 'settings.local.json') } }).permissionDecision, 'ask');
	const home = b.run({ tool_name: 'Write', tool_input: { file_path: join(b.home, '.claude', 'settings.json') } });
	assert.match(home.permissionDecisionReason, /Edit\(~\/\.claude\/settings\.json\)/);
	assert.equal(b.run({ tool_name: 'Edit', tool_input: { file_path: join(b.work, '.claude', 'settings.json') } }), null);
});

test('the hook process asks when its input is not JSON or is empty', (t) => {
	const b = box(t);
	assert.equal(b.run('not json').permissionDecision, 'ask');
	assert.equal(b.run('').permissionDecision, 'ask');
});

test('the hook process denies a merge with no record and lets a verified one through', (t) => {
	const b = box(t);
	const out = b.run(bashCall('gh pr merge 5 -R catati/dev'), github({ comments: [] }));
	assert.equal(out.permissionDecision, 'deny');
	assert.match(out.permissionDecisionReason, /no VERIFIER PASS by catati-ops names head aaaaaaa/);
	assert.equal(b.run(bashCall('gh pr merge 5 -R catati/dev'), github()), null);
});

test('the hook process reads the repo from the cwd origin, and the PR from its checked-out branch', (t) => {
	const b = box(t);
	assert.equal(b.run(bashCall('gh pr merge 9'), github({ repo: 'acme/widgets', number: 9 }), b.work), null);
	assert.equal(b.run(bashCall('gh pr merge --squash'), github({ repo: 'acme/widgets', number: 9, branch: 'feature/x' }), b.work), null);
	const missing = b.run(bashCall('gh pr merge other'), github({ repo: 'acme/widgets', number: 9 }), b.work);
	assert.equal(missing.permissionDecision, 'ask');
	assert.match(missing.permissionDecisionReason, /gh api repos\/acme\/widgets\/pulls\?state=open/);
});

test('the hook process reads the repo of the directory a cd goes to', (t) => {
	const b = box(t);
	const table = github({ repo: 'acme/widgets', number: 9 });
	assert.equal(b.run(bashCall('cd work && gh pr merge 9'), table, b.parent), null);
	assert.equal(b.run(bashCall(`cd ${b.plain} && cd ../work && gh pr merge 9`), table, b.parent), null);
	assert.equal(b.run(bashCall('cd work && gh pr merge 9'), github({ repo: 'acme/widgets', number: 9, comments: [] }), b.parent).permissionDecision, 'deny');
	const out = b.run(bashCall(`cd ${b.plain} && gh pr merge 9`), table, b.work);
	assert.equal(out.permissionDecision, 'ask');
	assert.match(out.permissionDecisionReason, /cannot tell which repo PR 9 is in; add -R <owner>\/<repo>/);
	assert.equal(b.run(bashCall(`cd ${b.plain} && gh pr merge 9 -R acme/widgets`), table, b.work), null);
});

test('the hook process asks for a merge from the cwd when it has several GitHub remotes, and uses the one there is', (t) => {
	const b = box(t);
	const table = github({ repo: 'acme/widgets', number: 9 });
	b.git('remote', 'add', 'upstream', 'https://github.com/acme/upstream.git');
	const out = b.run(bashCall('gh pr merge 9'), table, b.work);
	assert.equal(out.permissionDecision, 'ask');
	assert.match(out.permissionDecisionReason, /has several GitHub remotes, so add -R/);
	assert.equal(b.run(bashCall('gh pr merge 9 -R acme/widgets'), table, b.work), null);
	b.git('remote', 'set-url', 'origin', 'https://gitlab.com/acme/widgets.git');
	b.git('remote', 'set-url', 'upstream', 'git@github.com:acme/widgets.git');
	assert.equal(b.run(bashCall('gh pr merge 9'), table, b.work), null);
});

test('the hook process asks for gh pr merge 3 outside a repo, saying to add -R', (t) => {
	const b = box(t);
	const out = b.run(bashCall('gh pr merge 3'));
	assert.equal(out.permissionDecision, 'ask');
	assert.match(out.permissionDecisionReason, /add -R <owner>\/<repo>/);
});

test('the hook process guards the MCP merge tool, and asks when gh fails or is missing', (t) => {
	const b = box(t);
	const call = { tool_name: 'mcp__github__enable_pr_auto_merge', tool_input: { owner: 'acme', repo: 'widgets', pullNumber: 7 } };
	assert.equal(b.run(call, github({ repo: 'acme/widgets', number: 7 })), null);
	const failed = b.run(call, {});
	assert.equal(failed.permissionDecision, 'ask');
	assert.match(failed.permissionDecisionReason, /cannot read acme\/widgets#7: .*HTTP 404/);
	const empty = join(b.parent, 'empty');
	mkdirSync(empty);
	const missing = b.run(bashCall('gh pr merge 5 -R catati/dev'), github(), b.plain, { PATH: empty });
	assert.equal(missing.permissionDecision, 'ask');
	assert.match(missing.permissionDecisionReason, /cannot read catati\/dev#5: gh api repos\/catati\/dev\/pulls\/5 failed/);
});
