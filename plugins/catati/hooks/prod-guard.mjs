import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { isMainModule } from './main-module.mjs';

const ACCOUNTS = { dev: '028a7270e2ad8a208cd6b01800f363f3', prod: '69f8dc2296dd15d29e03693d6492f163' };
const APPROVE = 'Approve only if Shien asked for this specific prod action.';

const RUNNER_VERBS = { exec: 0, dlx: 0, x: 0, run: 0, workspace: 1 };
const KEYWORDS = ['if', 'then', 'elif', 'else', 'fi', 'do', 'done', 'while', 'until', '{', '}', '!'];
const WRAPPERS = Object.fromEntries(
	[
		...[...KEYWORDS, 'time', 'nohup', 'command', 'exec', 'corepack'].map((word) => [word]),
		...['npx', 'pnpx', 'bunx'].map((word) => [word, ['-p', '--package']]),
		['sudo', ['-u', '-g']], ['env', ['-u', '-C']], ['nice', ['-n']], ['timeout', ['-k', '-s', '--kill-after', '--signal'], 1],
		['xargs', ['-I', '-n', '-P', '-L', '-d', '-E', '-s', '-a']],
		['pnpm', ['--dir', '-C', '--filter', '-F'], 0, RUNNER_VERBS], ['npm', ['-w', '--workspace', '--prefix'], 0, RUNNER_VERBS],
		['yarn', ['--cwd'], 0, RUNNER_VERBS], ['bun', ['--cwd', '--filter', '-F'], 0, RUNNER_VERBS],
	].map(([word, flags = [], operands = 0, verbs = {}]) => [word, { flags, operands, verbs }]),
);
const PROGRAM_ALIASES = new Map([['@shopify/cli', 'shopify']]);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const ASSIGNMENT = /^([A-Za-z_]\w*)=(.*)$/s;

const WRANGLER_WRITES = new Set(['deploy', 'publish', 'delete', 'rollback', 'upload', 'put', 'bulk', 'create', 'update', 'apply', 'execute', 'trigger', 'pause', 'resume', 'purge', 'restore', 'insert', 'upsert', 'add', 'remove', 'set', 'rename', 'terminate']);
const WRANGLER_LOCAL_STORE = /^(d1|kv|r2)(:|$)/;
const TERRAFORM_WRITES = new Set(['apply', 'destroy', 'import', 'taint', 'untaint']);
const TERRAFORM_STATE_WRITES = new Set(['rm', 'mv', 'push', 'replace-provider']);
const SHOPIFY_DEV_THEME = ['--development', '-d', '--unpublished', '-u'];
const SHOPIFY_LIVE_THEME = ['--publish', '--live', '-l', '--allow-live', '-a'];
const MAKE_VALUE_FLAGS = ['-C', '-f', '-I', '-o', '-W', '--directory', '--file'];
const GH_VALUE_FLAGS = ['-R', '--repo', '-r', '--ref', '-f', '-F', '--field', '--raw-field', '-X', '--method', '-H', '--header', '-q', '--jq', '--json'];
const SHOPIFY_READS = ['get', 'list', 'search', 'find', 'show', 'generate', 'validate', 'graphql_query', 'graphql_schema'];
const ACTIONS_WRITE_PATH = /deploy\.yml\/dispatches|\/rerun|pending_deployments/;
const SQL_WRITE = /\b(INSERT|UPDATE|DELETE|REPLACE|UPSERT|DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\b/i;
const D1_QUERY_PATH = /\/d1\/database\/[^/'"`\s]+\/(query|raw)\b/;
const SQL_LITERAL = /\bsql\b['"]?\s*:\s*("(?:[^"\\\n]|\\.)*"|'[^'\\\n]*'|`[^`\\$]*`)/;

function text(value, name) {
	if (typeof value !== 'string') throw new TypeError(`${name} is ${JSON.stringify(value)}, not a string`);
	return value;
}

const isReadSql = (sql) => /^\s*(SELECT|WITH|EXPLAIN)\b/i.test(sql) && !/;(?!\s*$)/.test(sql) && !/--|\/\*/.test(sql) && !SQL_WRITE.test(sql);

function closingParen(source, from) {
	let depth = 1;
	for (let i = from; i < source.length; i++) {
		if (source[i] === '(') depth++;
		if (source[i] === ')' && --depth === 0) return i;
	}
	return -1;
}

function segments(command) {
	const found = [[]];
	const nested = [];
	let word = null;
	let quote = null;
	const end = () => {
		if (word !== null) found.at(-1).push(word);
		word = null;
	};
	for (let i = 0; i < command.length; i++) {
		const c = command[i];
		if (quote === "'") {
			if (c === "'") quote = null;
			else word += c;
		} else if (c === '\\') {
			const next = command[++i] ?? '';
			if (next !== '\n') word = (word ?? '') + (quote === '"' && !'$`"\\'.includes(next) ? c : '') + next;
		} else if (c === '`' || (c === '$' && command[i + 1] === '(')) {
			const start = c === '`' ? i + 1 : i + 2;
			const close = c === '`' ? command.indexOf('`', start) : closingParen(command, start);
			const stop = close === -1 ? command.length : close;
			nested.push(...segments(command.slice(start, stop)));
			word ??= '';
			i = stop;
		} else if (quote === '"') {
			if (c === '"') quote = null;
			else word += c;
		} else if (c === "'" || c === '"') {
			quote = c;
			word ??= '';
		} else if (';&|\n()'.includes(c)) {
			end();
			if (found.at(-1).length) found.push([]);
		} else if (/\s/.test(c)) end();
		else word = (word ?? '') + c;
	}
	end();
	return [...found, ...nested].filter((words) => words.length);
}

function skipFlags(words, i, valueFlags) {
	while (words[i]?.startsWith('-')) {
		const takesValue = valueFlags.includes(words[i]) && !Object.hasOwn(RUNNER_VERBS, words[i + 1]);
		i += takesValue ? 2 : 1;
	}
	return i;
}

function programName(word) {
	const bare = word?.replace(/(.)@[^/]*$/, '$1');
	return PROGRAM_ALIASES.get(bare) ?? bare?.split('/').at(-1);
}

function unwrap(words, inherited) {
	const env = { ...inherited };
	let i = 0;
	for (;;) {
		const assignment = ASSIGNMENT.exec(words[i] ?? '');
		const name = programName(words[i]);
		if (assignment) {
			env[assignment[1]] = assignment[2];
			i++;
		} else if (Object.hasOwn(WRAPPERS, name)) {
			const { flags, operands, verbs } = WRAPPERS[name];
			i = skipFlags(words, i + 1, flags) + operands;
			if (Object.hasOwn(verbs, words[i])) i = skipFlags(words, i + 1 + verbs[words[i]], flags);
		} else break;
	}
	return { program: programName(words[i]), args: words.slice(i + 1), env };
}

const flagValues = (args, names) =>
	args.flatMap((arg, i) => names.flatMap((name) => (arg === name ? [args[i + 1]] : arg.startsWith(`${name}=`) ? [arg.slice(name.length + 1)] : [])));
const positional = (args, valueFlags = []) => args.filter((arg, i) => !arg.startsWith('-') && !valueFlags.includes(args[i - 1]));
const resolvePath = (cwd, path = '.') => posix.resolve('/', cwd ?? '', path);
const isDeployWorkflow = (name) => /^(deploy(\.ya?ml)?|\d+)$/i.test(String(name).split('/').at(-1));
const hasProdSegment = (path) => path.split('/').includes('prod');

const PROGRAM_RULES = {
	wrangler(args, { env }) {
		if (!args.some((arg) => WRANGLER_WRITES.has(arg))) return null;
		const local = args.includes('--local') && !args.includes('--remote') && args.some((arg) => WRANGLER_LOCAL_STORE.test(arg));
		if (args.includes('--dry-run') || local) return null;
		const commands = flagValues(args, ['--command']);
		if (args.includes('d1') && args.includes('execute') && commands.length === 1 && flagValues(args, ['--file']).length === 0 && isReadSql(commands[0])) return null;
		const envs = flagValues(args, ['--env', '-e']);
		const prodAccount = env.CLOUDFLARE_ACCOUNT_ID === ACCOUNTS.prod;
		if (!prodAccount && envs.length > 0 && envs.every((env) => env === 'dev')) return null;
		const target = prodAccount ? 'CLOUDFLARE_ACCOUNT_ID names the Catati account' : envs.length ? `--env ${envs.join(', ')} is not dev` : 'no --env targets the production Worker';
		return `This Wrangler command writes to production, because ${target}`;
	},
	terraform(args, { cwd }) {
		const [command, stateCommand] = positional(args);
		const writes = TERRAFORM_WRITES.has(command) || (command === 'state' && TERRAFORM_STATE_WRITES.has(stateCommand));
		const roots = flagValues(args, ['-chdir']);
		const prodRoot = (roots.length ? roots : ['.']).some((root) => hasProdSegment(resolvePath(cwd, root)));
		return writes && prodRoot ? `This Terraform ${command} changes a prod root` : null;
	},
	shopify(args) {
		const has = (...words) => words.some((word) => args.includes(word));
		const configs = flagValues(args, ['--config', '-c']);
		if (has('app') && has('deploy', 'release') && (configs.length === 0 || configs.some((config) => config !== 'dev'))) return 'This Shopify app command changes the live app, because a --config is missing or not dev';
		if (has('theme') && has('publish', 'delete')) return 'This Shopify theme command changes the live store theme';
		if (has('theme') && has('push') && (!has(...SHOPIFY_DEV_THEME) || has(...SHOPIFY_LIVE_THEME))) return 'This Shopify theme push writes to a live store theme, because it names --publish or --live, or has no --development or --unpublished';
		return null;
	},
	make(args, { env }) {
		const prodVariable = [...args, `ENV=${env.ENV}`].some((arg) => /^ENV=prod(uction)?$/.test(arg));
		const targets = positional(args, MAKE_VALUE_FLAGS).filter((arg) => !arg.includes('='));
		const target = targets.find((name) => /deploy|apply|migrate|release/.test(name) && (name.endsWith('-prod') || prodVariable));
		return target ? `make ${target} runs a prod target` : null;
	},
	gh(args) {
		const [group, verb, ...rest] = positional(args, GH_VALUE_FLAGS);
		if (group === 'workflow' && verb === 'run' && rest.some(isDeployWorkflow)) return 'This starts a deploy workflow';
		if (group === 'run' && verb === 'rerun') return 'This reruns a GitHub Actions run, and the guard cannot tell whether that run deploys';
		return PROGRAM_RULES.curl(args);
	},
	curl(args) {
		const path = args.find((arg) => ACTIONS_WRITE_PATH.test(arg));
		return path ? `This calls ${path}, which starts, reruns or approves a deploy` : null;
	},
};
PROGRAM_RULES.tofu = PROGRAM_RULES.terraform;

const SCOPE_RULES = {
	cd: (args, scope) => (scope.cwd = resolvePath(scope.cwd, args.find((arg) => !/^[-~]/.test(arg)))),
	export: (args, scope) => Object.assign(scope.env, unwrap(args, {}).env),
};
SCOPE_RULES.pushd = SCOPE_RULES.cd;

function innerCommand(program, args) {
	if (program === 'eval') return args.join(' ');
	const flag = args.findIndex((arg) => /^-[A-Za-z]*c[A-Za-z]*$/.test(arg));
	return SHELLS.has(program) && flag !== -1 ? args[flag + 1] : undefined;
}

function judgeBash(command, scope) {
	for (const words of segments(command)) {
		const { program, args, env } = unwrap(words, scope.env);
		if (program === undefined) scope.env = env;
		if (Object.hasOwn(SCOPE_RULES, program)) SCOPE_RULES[program](args, scope);
		const inner = innerCommand(program, args);
		const found = inner === undefined ? null : judgeBash(inner, program === 'eval' ? scope : { cwd: scope.cwd, env });
		if (found) return found;
		const action = Object.hasOwn(PROGRAM_RULES, program) ? PROGRAM_RULES[program](args, { env, cwd: scope.cwd }) : null;
		if (action) return `${action} (${words.join(' ')})`;
	}
	return null;
}

function judgeCloudflare(input) {
	const code = text(input.code, 'mcp__cloudflare__execute code');
	if (input.account_id === ACCOUNTS.dev && !code.includes(ACCOUNTS.prod)) return null;
	const methods = [...code.matchAll(/\bmethod\b(?:['"]?\s*:\s*(['"])(\w+)\1)?/g)].map((match) => match[2] ?? 'unknown');
	const writes = methods.filter((method) => method !== 'GET');
	if (writes.length === 0) return null;
	const sqlKeys = code.match(/\bsql\b/g) ?? [];
	const literal = SQL_LITERAL.exec(code)?.[1];
	const sql = literal === undefined ? null : literal.startsWith('"') ? JSON.parse(literal) : literal.slice(1, -1);
	if (writes.length === 1 && writes[0] === 'POST' && D1_QUERY_PATH.test(code) && sqlKeys.length === 1 && sql !== null && isReadSql(sql)) return null;
	const account = input.account_id === undefined ? 'names no account' : `runs on account ${input.account_id}, not catati-dev`;
	return `This Cloudflare connector call has method ${writes.join(', ')} and ${account}`;
}

const ACTIONS_METHODS = {
	run_workflow: (input) => (isDeployWorkflow(text(input.workflow_id, 'workflow_id')) ? `This runs the ${input.workflow_id} workflow` : null),
	rerun_workflow_run: () => 'This reruns a GitHub Actions run, and the guard cannot tell whether that run deploys',
	rerun_failed_jobs: () => 'This reruns failed jobs of a GitHub Actions run, and the guard cannot tell whether that run deploys',
	cancel_workflow_run: () => null,
	delete_workflow_run_logs: () => null,
};

const TOOL_RULES = {
	Bash: (input, cwd) => judgeBash(text(input.command, 'Bash command'), { cwd, env: {} }),
	mcp__cloudflare__execute: judgeCloudflare,
	mcp__Shopify__: (input, cwd, toolName) =>
		SHOPIFY_READS.some((prefix) => toolName.startsWith(`mcp__Shopify__${prefix}`)) ? null : `${toolName} writes to the live Shopify store`,
	mcp__github__actions_run_trigger: (input) => {
		const method = text(input.method, 'actions_run_trigger method');
		if (!Object.hasOwn(ACTIONS_METHODS, method)) throw new TypeError(`actions_run_trigger method ${method} is unknown`);
		return ACTIONS_METHODS[method](input);
	},
};

export const JUDGED_TOOLS = Object.keys(TOOL_RULES);

export function decide(toolName, toolInput, cwd) {
	const key = JUDGED_TOOLS.find((tool) => tool === toolName || (tool.endsWith('__') && String(toolName).startsWith(tool)));
	if (!key) return null;
	if (toolInput === null || typeof toolInput !== 'object') throw new TypeError(`${toolName} input is not an object`);
	const action = TOOL_RULES[key](toolInput, cwd, toolName);
	return action ? { decision: 'ask', reason: `${action}. ${APPROVE}` } : null;
}

function run() {
	let result;
	try {
		const input = JSON.parse(readFileSync(0, 'utf8'));
		result = decide(input.tool_name, input.tool_input, input.cwd ?? process.cwd());
	} catch (error) {
		result = { decision: 'ask', reason: `The prod guard could not read this call (${error?.message ?? error}). ${APPROVE}` };
	}
	if (result) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: result.decision, permissionDecisionReason: result.reason } }));
}

if (isMainModule(import.meta.url)) run();
