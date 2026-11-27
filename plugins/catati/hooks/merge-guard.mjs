import { execFileSync } from 'node:child_process';
import { OPERATOR, verdict } from '../templates/verifier-record/verifier-record.mjs';
import { isAssignment, isReserved, simpleCommands } from './shell.mjs';

const MERGE_TOOLS = new Set(['mcp__github__merge_pull_request', 'mcp__github__enable_pr_auto_merge']);
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
const PASSED = new Set(['success', 'skipped', 'neutral']);

const unknown = (what) => {
	throw new Error(`${what}, so the merge guard cannot tell which PR it merges`);
};
const isOn = (word) => Boolean(word) && !/^(false|f|0)$/i.test(word.text);
const base = (word) => word.text.split('/').at(-1);

// owner/name from a gh -R value, a GH_REPO value or a route, with {owner}, {repo}, :owner and :repo
// filled from here, the repo of the cwd. Null when it names no github.com repo.
export function repoName(text, here) {
	if (text === undefined) return here ?? null;
	const placeholder = /\{owner\}|\{repo\}|^:owner|:repo$/.test(text);
	if (placeholder && !here) return null;
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
	if (area?.text === 'pr' && action?.dynamic) unknown('its subcommand is a variable');
	if (area?.text === 'pr' && action?.text === 'merge') return prMergeTarget(target, last('-R') ?? env, last('--disable-auto'), last('--admin'));
	if (area?.text !== 'api' || !action) return [];
	const fields = [...(values['-F'] ?? []), ...(values['-f'] ?? [])];
	const method = last('-X');
	if (method?.dynamic) unknown('its method is a variable');
	const verb = method?.text.toUpperCase() ?? (fields.length || values['--input'] ? 'POST' : 'GET');
	if (/^(?:https:\/\/api\.github\.com\/|\/)?graphql\/?$/i.test(action.text)) {
		const query = fields.filter((field) => /^query=/.test(field.text));
		if (values['--input'] || query.some((field) => field.dynamic || /^query=@/.test(field.text))) unknown('this GraphQL call builds its query from a file or a variable');
		if (query.some((field) => /mutation/i.test(field.text) && GRAPHQL_MERGE.test(field.text))) unknown('a GraphQL merge names no PR. Merge with gh pr merge <n> -R <owner>/<repo> instead');
		return [];
	}
	if (verb === 'GET' || verb === 'DELETE') return [];
	if (action.dynamic) unknown('this gh api write names its endpoint in a variable');
	if (BRANCH_MERGE.test(action.text)) unknown('a merge of one branch into another skips the PR');
	const route = action.text.match(MERGE_ROUTE);
	if (!route) return [];
	if (!/^\d+$/.test(route[2])) unknown(`the PR ${route[2]} is not a number`);
	return [{ repo: route[1], number: Number(route[2]), queued: false }];
}

function prMergeTarget(target, repo, disable, admin) {
	if (isOn(disable)) return [];
	if (repo?.dynamic || target?.dynamic) unknown('its PR or repo is a variable');
	const queued = !isOn(admin);
	const url = target?.text.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
	if (url) return [{ repo: url[1], number: Number(url[2]), queued }];
	if (!target) return [{ repo: repo?.text, branch: null, queued }];
	if (/^#?\d+$/.test(target.text)) return [{ repo: repo?.text, number: Number(target.text.replace('#', '')), queued }];
	return [{ repo: repo?.text, branch: target.text, queued }];
}

// The PRs a tool call would merge or set to auto-merge: { repo, number } or { repo, branch } to look
// up, with branch null for the checked-out one, and repo the raw text the call names, undefined
// when it names none. queued is true only for gh pr merge without --admin, the one call that goes
// through a merge queue. It throws when the call may merge but names a PR this cannot read.
export function mergeTargets({ tool_name, tool_input }, env = process.env.GH_REPO) {
	if (MERGE_TOOLS.has(tool_name)) return [{ repo: tool_input?.owner && tool_input?.repo ? `${tool_input.owner}/${tool_input.repo}` : '', number: Number(tool_input?.pullNumber), queued: false }];
	if (tool_name !== 'Bash') return [];
	return commandTargets(String(tool_input?.command ?? ''), env);
}

function commandTargets(command, ghRepo) {
	const commands = simpleCommands(command);
	const setsRepo = commands.some((words) => words.some((word) => /^GH_REPO=/.test(word.text)));
	return commands.flatMap((words) => {
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
		if (!head) return [];
		const rest = words.slice(start + 1);
		if (head.dynamic && ['pr', 'api'].includes(rest[0]?.text)) unknown('gh is a variable');
		if (base(head) === 'eval') return commandTargets(rest.map((word) => word.text).join(' '), ghRepo);
		const script = shellScript(words, start);
		if (script) return commandTargets(script.text, ghRepo);
		const gh = words.findIndex((word, index) => index >= start && base(word) === 'gh');
		if (gh < 0) return [];
		const args = words.slice(gh + 1);
		if (gh > start && args[0]?.dynamic) return [];
		const found = ghTarget(args, env);
		if (found.length && gh > start) unknown(`${head.text} runs gh. Run gh directly`);
		if (found.length && setsRepo && env === undefined) unknown('GH_REPO is set in this command. Pass -R instead');
		return found;
	});
}

// The script word of a bash -c, sh -c and the like, after the shell's own options.
function shellScript(words, start) {
	const shell = words.findIndex((word, index) => index >= start && SHELLS.has(base(word)));
	if (shell < 0) return undefined;
	const flag = words.findIndex((word, index) => index > shell && /^-[a-z]*c[a-z]*$/.test(word.text));
	if (flag < 0) return undefined;
	let at = flag + 1;
	while (/^[-+]/.test(words[at]?.text ?? '')) {
		if (words[at].text === '--') {
			at++;
			break;
		}
		at += /^[-+][A-Za-z]*[oO]$/.test(words[at].text) ? 2 : 1;
	}
	return words[at];
}

export function failingChecks(required, runs, statuses) {
	return required.flatMap((name) => {
		const run = runs.filter((check) => check.name === name).reduce((latest, check) => (latest && latest.id > check.id ? latest : check), undefined);
		const status = statuses.find((entry) => entry.context === name);
		if (status?.state === 'success' || PASSED.has(run?.conclusion)) return [];
		return [{ name, state: run?.conclusion ?? run?.status ?? status?.state ?? 'missing' }];
	});
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

const cwdRepo = (cwd) => originRepo(gitIn(cwd, ['remote', 'get-url', 'origin']));

function pullFor(read, repo, branch, cwd) {
	const name = branch ?? gitIn(cwd, ['branch', '--show-current']);
	if (!name) return { problem: `no branch is checked out in ${cwd}, so name the PR: gh pr merge <n> -R ${repo}` };
	const [pull] = read(`repos/${repo}/pulls?state=open&head=${repo.split('/')[0]}:${encodeURIComponent(name)}`);
	return pull ? { number: pull.number } : { problem: `${repo} has no open PR for the branch ${name}` };
}

// What keeps one PR from merging, as a list of reasons; empty when it may merge.
export function prProblems(read, repo, number, queued) {
	const label = `${repo}#${number}`;
	const pr = read(`repos/${repo}/pulls/${number}`);
	if (pr.state !== 'open') return [`${label} is ${pr.merged_at ? 'merged' : 'closed'} already`];
	const head = pr.head.sha;
	const short = head.slice(0, 7);
	const baseRef = pr.base.ref;
	const problems = [];
	const comments = read(`repos/${repo}/issues/${number}/comments`, true)
		.flat()
		.map((comment) => ({ author: comment.user?.login, body: comment.body }));
	if (verdict(head, comments).state !== 'success') problems.push(`no VERIFIER PASS by ${OPERATOR} names head ${short}`);
	const rules = read(`repos/${repo}/rules/branches/${baseRef}`);
	const queue = rules.some((rule) => rule.type === 'merge_queue');
	if (queue && !queued) problems.push(`this call skips ${baseRef}'s merge queue; merge with a plain gh pr merge ${number} -R ${repo}, without --admin`);
	if (!queue) {
		const behind = read(`repos/${repo}/compare/${baseRef}...${head}`).behind_by;
		if (behind > 0) problems.push(`head ${short} is ${behind} commit(s) behind ${baseRef}; merge ${baseRef} in and verify again`);
	}
	const required = rules.filter((rule) => rule.type === 'required_status_checks').flatMap((rule) => rule.parameters.required_status_checks.map((check) => check.context));
	if (required.length) {
		const runs = read(`repos/${repo}/commits/${head}/check-runs`, true).flatMap((page) => page.check_runs);
		const statuses = read(`repos/${repo}/commits/${head}/status`).statuses;
		for (const check of failingChecks(required, runs, statuses)) problems.push(`required check ${check.name} is ${check.state} on head ${short}`);
	}
	return problems.map((problem) => `${label}: ${problem}`);
}

// Why the merge guard refuses this tool call, or undefined when it merges nothing or may merge.
export function mergeDenial(input, read = ghRead) {
	const cwd = input.cwd ?? process.cwd();
	let targets;
	try {
		targets = mergeTargets(input);
	} catch (error) {
		return `catati merge guard: ${error.message}.`;
	}
	if (!targets.length) return undefined;
	const here = cwdRepo(cwd);
	const problems = [];
	const seen = new Map();
	try {
		for (const target of targets) {
			const repo = repoName(target.repo, here);
			const what = target.number ?? (target.branch ? `the branch ${target.branch}` : 'the checked-out branch');
			if (!repo) {
				problems.push(`cannot tell which repo ${typeof what === 'number' ? `PR ${what}` : what} is in; add -R <owner>/<repo>`);
				continue;
			}
			const found = target.number === undefined ? pullFor(read, repo, target.branch, cwd) : { number: target.number };
			if (found.problem) {
				problems.push(found.problem);
				continue;
			}
			const key = `${repo.toLowerCase()}#${found.number}`;
			seen.set(key, { repo, number: found.number, queued: (seen.get(key)?.queued ?? true) && target.queued });
		}
		for (const { repo, number, queued } of seen.values()) problems.push(...prProblems(read, repo, number, queued));
	} catch (error) {
		return `catati merge guard: cannot check the merge, so it is refused: ${error.message}`;
	}
	if (!problems.length) return undefined;
	return `catati merge guard refused the merge: ${problems.join('; ')}.`;
}
