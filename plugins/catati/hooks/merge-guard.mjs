import { execFileSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import { OPERATOR, verdict } from '../templates/verifier-record/verifier-record.mjs';
import { isAssignment, isReserved, simpleCommands } from './shell.mjs';

const MERGE_TOOL = /^mcp__.+__(?:merge_pull_request|enable_pr_auto_merge)$/;
const VALUE_FLAGS = new Set(
	'-b --body -F --body-file -t --subject -A --author-email --match-head-commit -R --repo -X --method -H --header -f --field --raw-field --input -q --jq --template --hostname -p --preview --cache'.split(
		' ',
	),
);
const MERGE_ROUTE = /^(?:https:\/\/api\.github\.com)?\/?repos\/([^/]+\/[^/]+)\/pulls\/([^/?]+)\/(merge|ccr\/auto_merge|auto_merge)\b/;
const GRAPHQL_MERGE = /\b(?:mergePullRequest|mergeBranch|enablePullRequestAutoMerge|enqueuePullRequest)\b/;
const BRANCH_MERGE = /^(?:https:\/\/api\.github\.com)?\/?repos\/[^/]+\/[^/]+\/merges\b/;
const ALIASES = { '--repo': '-R', '--method': '-X', '--field': '-F', '--raw-field': '-f' };
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash']);
const HIDDEN_GH = /\bgh\b[\s\S]*\b(?:pr\b[\s\S]*\bmerge|api|alias)\b/;
const PLACEHOLDER = /\{owner\}|\{repo\}|^:owner|:repo$/;

// A call that hides a merge from the guard (deny), or names one the guard cannot read (ask).
class Stop extends Error {
	constructor(decision, why) {
		super(why);
		this.decision = decision;
	}
}
const refuse = (why) => {
	throw new Stop('deny', why);
};
const unknown = (what) => {
	throw new Stop('ask', `${what}, so the merge guard cannot tell which PR it merges`);
};
const isOn = (word) => Boolean(word) && !/^(false|f|0)$/i.test(word.text);
const base = (word) => word.text.split('/').at(-1);

// owner/name from a gh -R value, a GH_REPO value or a route, with {owner}, {repo}, :owner and :repo
// filled from here, the repo of the cwd. Null when it names no github.com repo.
export function repoName(text, here) {
	if (text === undefined) return here ?? null;
	if (PLACEHOLDER.test(text) && !here) return null;
	const [owner, name] = (here ?? '/').split('/');
	const parts = text
		.replace(/\{owner\}|^:owner/, owner)
		.replace(/\{repo\}|:repo$/, name)
		.replace(/^(?:\w+:\/\/)?(?:git@)?(?:www\.)?github\.com[:/]/i, 'github.com/')
		.replace(/^https?:\/\//, '')
		.replace(/(\.git)?\/?$/, '')
		.split('/');
	if (parts.length === 3 && parts[0].toLowerCase() !== 'github.com') return null;
	const [o, n] = parts.slice(-2);
	return parts.length >= 2 && parts.length <= 3 && o && n ? `${o}/${n}` : null;
}

// owner/name from a git remote URL: its last two path segments.
export function originRepo(url) {
	const match = url.trim().match(/[/:]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
	return match ? `${match[1]}/${match[2]}` : null;
}

function ghTarget(args, env) {
	const positional = [];
	const values = {};
	const note = (flag, value) => {
		const key = ALIASES[flag] ?? flag;
		values[key] = [...(values[key] ?? []), value];
	};
	for (let index = 0; index < args.length; index++) {
		const word = args[index];
		const [flag, inline] = word.text.split(/=(.*)/s);
		const bundle = /^-[A-Za-z]{2}/.test(word.text) ? word.text.slice(1) : '';
		const at = [...bundle].findIndex((letter) => VALUE_FLAGS.has(`-${letter}`));
		if (!flag.startsWith('-') || flag === '-') positional.push(word);
		else if (at >= 0) {
			for (const letter of bundle.slice(0, at)) note(`-${letter}`, { text: 'true', dynamic: false });
			const attached = bundle.slice(at + 1);
			const value = attached ? { text: attached, dynamic: word.dynamic } : args[++index];
			if (value) note(`-${bundle[at]}`, value);
		} else if (!VALUE_FLAGS.has(flag)) note(flag, { text: inline ?? 'true', dynamic: word.dynamic });
		else if (inline !== undefined) note(flag, { text: inline, dynamic: word.dynamic });
		else if (index + 1 < args.length) note(flag, args[++index]);
	}
	const last = (flag) => values[flag]?.at(-1);
	const [area, action, target] = positional;
	if (area?.dynamic) unknown('its subcommand is a variable');
	if (last('--help') || last('-h')) return [];
	if (area?.text === 'alias' && (action?.dynamic || ['set', 'import'].includes(action?.text))) refuse('an alias hides a merge from the guard; run the command it stands for');
	if (area?.text === 'pr' && action?.dynamic) unknown('its subcommand is a variable');
	if (area?.text === 'pr' && action?.text === 'merge') return prMergeTarget(target, last('-R') ?? env, last('--disable-auto'));
	if (area?.text !== 'api' || !action) return [];
	const fields = [...(values['-F'] ?? []), ...(values['-f'] ?? [])];
	const method = last('-X');
	if (method?.dynamic) unknown('its method is a variable');
	const verb = method?.text.toUpperCase() ?? (fields.length || values['--input'] ? 'POST' : 'GET');
	if (/^(?:https:\/\/api\.github\.com\/|\/)?graphql\/?$/i.test(action.text)) {
		const query = fields.filter((field) => /^query=/.test(field.text));
		if (values['--input'] || query.some((field) => field.dynamic || /^query=@/.test(field.text))) unknown('this GraphQL call builds its query from a file or a variable');
		if (query.some((field) => /mutation/i.test(field.text) && GRAPHQL_MERGE.test(field.text))) refuse('a GraphQL merge names no PR. Merge with gh pr merge <n> -R <owner>/<repo> instead');
		return [];
	}
	if (verb === 'GET' || verb === 'DELETE') return [];
	if (action.dynamic) unknown('this gh api write names its endpoint in a variable');
	if (BRANCH_MERGE.test(action.text)) refuse('a merge of one branch into another skips the PR. Merge the PR instead');
	const route = action.text.match(MERGE_ROUTE);
	if (!route) return [];
	if (!/^\d+$/.test(route[2])) unknown(`the PR ${route[2]} is not a number`);
	return [{ repo: route[1], number: Number(route[2]) }];
}

function prMergeTarget(target, repo, disable) {
	if (isOn(disable)) return [];
	if (repo?.dynamic || target?.dynamic) unknown('its PR or repo is a variable');
	const url = target?.text.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
	if (url) return [{ repo: url[1], number: Number(url[2]) }];
	if (!target) return [{ repo: repo?.text, branch: null }];
	if (/^#?\d+$/.test(target.text)) return [{ repo: repo?.text, number: Number(target.text.replace('#', '')) }];
	return [{ repo: repo?.text, branch: target.text }];
}

// The PRs a tool call would merge or set to auto-merge: { repo, number } or { repo, branch } to look
// up, with branch null for the checked-out one, and repo the raw text the call names, undefined
// when it names none. A Bash target also carries dir, the directory the shell is in when it runs,
// or null when a cd before it goes somewhere this cannot work out. It throws a Stop when the call
// hides a merge, or may merge but names a PR this cannot read.
export function mergeTargets({ tool_name, tool_input, cwd }, env = process.env.GH_REPO, home = process.env.HOME) {
	if (MERGE_TOOL.test(tool_name)) return [{ repo: tool_input?.owner && tool_input?.repo ? `${tool_input.owner}/${tool_input.repo}` : '', number: Number(tool_input?.pullNumber) }];
	if (tool_name !== 'Bash') return [];
	return walk(String(tool_input?.command ?? ''), env, cwd ?? process.cwd(), home).targets;
}

// Where cd or pushd with these words goes from current, with ~ for home: null when it cannot tell.
function moveTo(args, current, home) {
	let at = 0;
	while (/^-[LPe@]+$/.test(args[at]?.text ?? '')) at++;
	if (args[at]?.text === '--') at++;
	const target = args[at];
	if (!target) return home || null;
	if (target.dynamic || target.text === '-' || (/^~/.test(target.text) && !(home && /^~(?:\/|$)/.test(target.text)))) return null;
	const path = target.text.replace(/^~/, home);
	if (isAbsolute(path)) return resolve(path);
	return current === null ? null : resolve(current, path);
}

// Walks the command's simple commands in order, keeping the directory each subshell is in, and
// returns the merge targets and the directory the shell ends in.
function walk(command, ghRepo, cwd, home) {
	const commands = simpleCommands(command);
	const setsRepo = commands.some((words) => words.some((word) => /^GH_REPO=/.test(word.text)));
	const dirs = new Map([['', cwd]]);
	const dirOf = (scope) => {
		if (!dirs.has(scope)) dirs.set(scope, dirOf(scope.slice(0, scope.lastIndexOf('/'))));
		return dirs.get(scope);
	};
	const pushed = [];
	const targets = [];
	for (const words of commands) {
		const scope = words.scope ?? '';
		let start = 0;
		let env = ghRepo ? { text: ghRepo, dynamic: false } : undefined;
		for (; start < words.length; start++) {
			const word = words[start];
			if (isReserved(word)) continue;
			if (!isAssignment(word)) break;
			const [name, value] = word.text.split(/=(.*)/s);
			if (name === 'GH_REPO') env = { text: value, dynamic: word.dynamic };
		}
		const head = words[start];
		if (!head) continue;
		let verb = start;
		while (['builtin', 'command'].includes(words[verb]?.text)) verb++;
		const move = words[verb]?.dynamic ? undefined : words[verb]?.text;
		if (move === 'cd' || move === 'pushd') {
			if (move === 'pushd') pushed.push(dirOf(scope));
			dirs.set(scope, moveTo(words.slice(verb + 1), dirOf(scope), home));
			continue;
		}
		if (move === 'popd') {
			dirs.set(scope, pushed.length ? pushed.pop() : null);
			continue;
		}
		const rest = words.slice(start + 1);
		if (head.dynamic && ['pr', 'api'].includes(rest[0]?.text)) unknown('gh is a variable');
		const inner = innerScript(words, start);
		if (inner?.piped && HIDDEN_GH.test(command)) refuse('a shell reads gh from a pipe, which hides it from the guard; run gh directly');
		if (inner?.text !== undefined) {
			const nested = walk(inner.text, ghRepo, dirOf(scope), home);
			targets.push(...nested.targets);
			if (base(head) === 'eval') dirs.set(scope, nested.dir);
			continue;
		}
		const gh = words.findIndex((word, index) => index >= start && base(word) === 'gh');
		if (gh < 0) continue;
		const args = words.slice(gh + 1);
		if (gh > start && args[0]?.dynamic) continue;
		const found = ghTarget(args, env);
		if (found.length && gh > start) unknown(`${head.text} runs gh. Run gh directly`);
		if (found.length && setsRepo && env === undefined) unknown('GH_REPO is set in this command. Pass -R instead');
		targets.push(...found.map((target) => ({ ...target, dir: dirOf(scope) })));
	}
	return { targets, dir: dirOf('') };
}

// The script that the command starting at start runs as a script of its own: { text } for eval,
// bash -c and a shell fed by a heredoc or here-string, { piped } for a shell that reads a pipe.
function innerScript(words, start) {
	if (base(words[start]) === 'eval') return { text: words.slice(start + 1).map((word) => word.text).join(' ') };
	const shell = words.findIndex((word, index) => index >= start && SHELLS.has(base(word)));
	if (shell < 0) return undefined;
	let at = shell + 1;
	let script = false;
	let stdin = false;
	while (/^[-+]/.test(words[at]?.text ?? '')) {
		const flag = words[at++].text;
		if (flag === '--' || flag === '-') break;
		script ||= /^-[a-z]*c[a-z]*$/.test(flag);
		stdin ||= /^-[a-z]*s[a-z]*$/.test(flag);
		if (/^[-+][A-Za-z]*[oO]$/.test(flag)) at++;
	}
	if (script) return words[at] && { text: words[at].text };
	if (words[at] && !stdin) return undefined;
	if (words.stdin !== undefined) return { text: words.stdin };
	return words.piped ? { piped: true } : undefined;
}

// Reads one GitHub API path through gh, or with all every page of it as a list of pages.
export function ghRead(path, all = false) {
	const args = all ? ['api', '--paginate', '--slurp', path] : ['api', path];
	try {
		return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }));
	} catch (error) {
		const why = `${error.stderr ?? ''}`.trim().split('\n')[0] || error.message;
		throw new Error(`gh api ${path} failed: ${why}`);
	}
}

function gitIn(cwd, args) {
	try {
		return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		return '';
	}
}

// The repo gh picks in cwd: its one GitHub remote, else origin.
function cwdRepo(cwd) {
	const urls = gitIn(cwd, ['config', '--get-regexp', '^remote\\..*\\.url$']).split('\n').map((line) => line.split(' ').slice(1).join(' '));
	const github = new Set(urls.filter((url) => /github\.com[:/]/i.test(url)).map(originRepo));
	if (github.size > 1) return { problem: `the repo in ${cwd} has several GitHub remotes, so add -R <owner>/<repo>` };
	return { repo: [...github][0] ?? originRepo(gitIn(cwd, ['remote', 'get-url', 'origin'])) };
}

function pullFor(read, repo, branch, cwd) {
	const name = branch ?? gitIn(cwd, ['branch', '--show-current']);
	if (!name) return { problem: `no branch is checked out in ${cwd}, so name the PR: gh pr merge <n> -R ${repo}` };
	const [pull] = read(`repos/${repo}/pulls?state=open&head=${repo.split('/')[0]}:${encodeURIComponent(name)}`);
	return pull ? { number: pull.number } : { problem: `${repo} has no open PR for the branch ${name}` };
}

// Why one PR may not merge, or undefined when a VERIFIER PASS names its head or it is not open,
// which gh reports itself.
export function missingRecord(read, repo, number) {
	const label = `${repo}#${number}`;
	const pr = read(`repos/${repo}/pulls/${number}`);
	if (pr.state !== 'open') return undefined;
	const head = pr.head.sha;
	const comments = read(`repos/${repo}/issues/${number}/comments`, true)
		.flat()
		.map((comment) => ({ author: comment.user?.login, body: comment.body }));
	const record = verdict(head, comments);
	if (record.state === 'success') return undefined;
	const short = head.slice(0, 7);
	if (record.description.startsWith('FAIL')) return `${label}: the latest record by ${OPERATOR} on head ${short} is a VERIFIER FAIL`;
	return `${label}: no VERIFIER PASS by ${OPERATOR} names head ${short}`;
}

// The merge guard's answer for one tool call: { decision: 'deny' } for a hidden merge or one with no
// VERIFIER PASS on its head, { decision: 'ask' } when it cannot read which PR or the PR itself, each
// with a reason, or undefined when the call merges nothing or may merge.
export function mergeDecision(input, read = ghRead, home = process.env.HOME) {
	const cwd = input.cwd ?? process.cwd();
	let targets;
	try {
		targets = mergeTargets({ ...input, cwd }, process.env.GH_REPO, home);
	} catch (error) {
		return { decision: error instanceof Stop ? error.decision : 'ask', reason: `catati merge guard: ${error.message}.` };
	}
	const asks = [];
	const denies = [];
	const pulls = new Map();
	for (const target of targets) {
		const fromCwd = target.repo === undefined || PLACEHOLDER.test(target.repo);
		const dir = target.dir === undefined ? cwd : target.dir;
		if (fromCwd && dir === null) {
			asks.push('a cd before the merge goes to a directory the guard cannot work out, so add -R <owner>/<repo>');
			continue;
		}
		const here = fromCwd ? cwdRepo(dir) : {};
		if (here.problem) {
			asks.push(here.problem);
			continue;
		}
		const repo = repoName(target.repo, here.repo);
		const what = target.number ?? (target.branch ? `the branch ${target.branch}` : 'the checked-out branch');
		if (!repo) {
			asks.push(`cannot tell which repo ${typeof what === 'number' ? `PR ${what}` : what} is in; add -R <owner>/<repo>`);
			continue;
		}
		try {
			const found = target.number === undefined ? pullFor(read, repo, target.branch, dir) : { number: target.number };
			if (found.problem) asks.push(found.problem);
			else pulls.set(`${repo.toLowerCase()}#${found.number}`, { repo, number: found.number });
		} catch (error) {
			asks.push(`cannot read the PR: ${error.message}`);
		}
	}
	for (const { repo, number } of pulls.values()) {
		try {
			const problem = missingRecord(read, repo, number);
			if (problem) denies.push(problem);
		} catch (error) {
			asks.push(`cannot read ${repo}#${number}: ${error.message}`);
		}
	}
	if (denies.length) return { decision: 'deny', reason: `catati merge guard refused the merge: ${denies.join('; ')}.` };
	if (asks.length) return { decision: 'ask', reason: `catati merge guard cannot check the merge, so it asks: ${asks.join('; ')}.` };
	return undefined;
}
