import { readFileSync } from 'node:fs';
import { isMainModule } from './main-module.mjs';

const ACCOUNTS = { dev: '028a7270e2ad8a208cd6b01800f363f3', prod: '69f8dc2296dd15d29e03693d6492f163' };
const APPROVE = 'Approve only if Shien asked for this specific prod action.';

const RUNNER_FLAGS = ['--dir', '-C', '--filter', '-w'];
const WRAPPER_FLAGS = {
	sudo: ['-u', '-g'], env: ['-u', '-C'], nice: ['-n'], time: [], timeout: [], nohup: [], command: [], exec: [],
	npx: RUNNER_FLAGS, pnpx: RUNNER_FLAGS, bunx: RUNNER_FLAGS,
};
const RUNNERS = new Set(['pnpm', 'npm', 'yarn', 'bun']);
const RUNNER_VERBS = new Set(['exec', 'dlx', 'x']);
const SHELLS = new Set(['bash', 'sh']);

const WRANGLER_WRITES = new Set(['deploy', 'publish', 'delete', 'rollback', 'upload', 'put', 'bulk', 'create', 'update', 'apply', 'execute', 'trigger', 'pause', 'resume', 'purge']);
const TERRAFORM_WRITES = new Set(['apply', 'destroy', 'import']);
const TERRAFORM_STATE_WRITES = new Set(['rm', 'mv', 'push', 'replace-provider']);
const SHOPIFY_DEV_THEME = ['--development', '-d', '--unpublished', '-u'];
const SHOPIFY_READS = ['get', 'list', 'search', 'find', 'show', 'generate', 'validate', 'graphql_query', 'graphql_schema'];
const ACTIONS_WRITE_PATH = /deploy\.yml\/dispatches|\/rerun|pending_deployments/;
const SQL_WRITE = /\b(INSERT|UPDATE|DELETE|REPLACE|UPSERT|DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\b/i;
const D1_QUERY_PATH = /\/d1\/database\/[^/'"`\s]+\/(query|raw)\b/;
const SQL_LITERAL = /\bsql\b['"]?\s*:\s*("(?:[^"\\\n]|\\.)*"|'[^'\\\n]*'|`[^`\\$]*`)/;

function text(value, name) {
	if (typeof value !== 'string') throw new TypeError(`${name} is ${JSON.stringify(value)}, not a string`);
	return value;
}

function isReadSql(sql) {
	return /^\s*(SELECT|WITH|EXPLAIN)\b/i.test(sql) && !/;(?!\s*$)/.test(sql) && !/--|\/\*/.test(sql) && !SQL_WRITE.test(sql);
}

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
		const takesValue = valueFlags.includes(words[i]) && !RUNNER_VERBS.has(words[i + 1]);
		i += takesValue ? 2 : 1;
	}
	return i;
}

function unwrap(words) {
	let accountId;
	let i = 0;
	for (;;) {
		const word = words[i];
		const assignment = /^([A-Za-z_]\w*)=(.*)$/s.exec(word ?? '');
		if (assignment) {
			if (assignment[1] === 'CLOUDFLARE_ACCOUNT_ID') accountId = assignment[2];
			i++;
		} else if (Object.hasOwn(WRAPPER_FLAGS, word)) {
			i = skipFlags(words, i + 1, WRAPPER_FLAGS[word]) + (word === 'timeout' ? 1 : 0);
		} else if (RUNNERS.has(word)) {
			const verb = skipFlags(words, i + 1, RUNNER_FLAGS);
			if (!RUNNER_VERBS.has(words[verb])) break;
			i = verb + 1;
		} else break;
	}
	return { program: words[i]?.split('/').at(-1), args: words.slice(i + 1), accountId };
}

function flagValues(args, names) {
	const values = [];
	args.forEach((arg, i) => {
		if (names.includes(arg)) values.push(args[i + 1]);
		for (const name of names) if (arg.startsWith(`${name}=`)) values.push(arg.slice(name.length + 1));
	});
	return values;
}

const positional = (args) => args.filter((arg) => !arg.startsWith('-'));
const isDeployWorkflow = (name) => /^(deploy(\.ya?ml)?|\d+)$/i.test(String(name).split('/').at(-1));
const hasProdSegment = (path) => String(path ?? '').split('/').includes('prod');

const PROGRAM_RULES = {
	wrangler(args, { accountId }) {
		if (!args.some((arg) => WRANGLER_WRITES.has(arg))) return null;
		if (args.includes('--dry-run') || args.includes('--local')) return null;
		const commands = flagValues(args, ['--command']);
		if (args.includes('d1') && args.includes('execute') && commands.length === 1 && flagValues(args, ['--file']).length === 0 && isReadSql(commands[0])) return null;
		const envs = flagValues(args, ['--env', '-e']);
		const prodAccount = accountId === ACCOUNTS.prod;
		if (!prodAccount && envs.length > 0 && envs.every((env) => env === 'dev')) return null;
		const target = prodAccount ? 'CLOUDFLARE_ACCOUNT_ID names the Catati account' : envs.length ? `--env ${envs.join(', ')} is not dev` : 'no --env targets the production Worker';
		return `This Wrangler command writes to production, because ${target}`;
	},
	terraform(args, { cwd }) {
		const [command, stateCommand] = positional(args);
		const writes = TERRAFORM_WRITES.has(command) || (command === 'state' && TERRAFORM_STATE_WRITES.has(stateCommand));
		const prodRoot = flagValues(args, ['-chdir']).some(hasProdSegment) || hasProdSegment(cwd);
		return writes && prodRoot ? `This Terraform ${command} changes a prod root` : null;
	},
	shopify(args) {
		const has = (...words) => words.some((word) => args.includes(word));
		if (has('app') && has('deploy', 'release') && !flagValues(args, ['--config', '-c']).includes('dev')) return 'This Shopify app command changes the live app, because it has no --config dev';
		if (has('theme') && has('publish', 'delete')) return 'This Shopify theme command changes the live store theme';
		if (has('theme') && has('push') && !has(...SHOPIFY_DEV_THEME)) return 'This Shopify theme push writes to a live store theme, because it has no --development or --unpublished';
		return null;
	},
	make(args) {
		const targets = positional(args).filter((arg) => !arg.includes('='));
		const target = targets.find((name) => name.endsWith('-prod') && /deploy|apply|migrate|release/.test(name));
		return target ? `make ${target} runs a prod target` : null;
	},
	gh(args) {
		const [group, verb, ...rest] = positional(args);
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

function judgeBash(command, cwd) {
	for (const words of segments(command)) {
		const { program, args, accountId } = unwrap(words);
		const shellFlag = args.findIndex((arg) => /^-[A-Za-z]*c[A-Za-z]*$/.test(arg));
		if (SHELLS.has(program) && shellFlag !== -1 && args[shellFlag + 1] !== undefined) {
			const inner = judgeBash(args[shellFlag + 1], cwd);
			if (inner) return inner;
		}
		if (program === 'eval') {
			const inner = judgeBash(args.join(' '), cwd);
			if (inner) return inner;
		}
		const action = Object.hasOwn(PROGRAM_RULES, program) ? PROGRAM_RULES[program](args, { accountId, cwd }) : null;
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
	Bash: (input, cwd) => judgeBash(text(input.command, 'Bash command'), cwd),
	mcp__cloudflare__execute: judgeCloudflare,
	mcp__Shopify__: (input, cwd, toolName) => {
		const name = toolName.slice('mcp__Shopify__'.length);
		return SHOPIFY_READS.some((prefix) => name.startsWith(prefix)) ? null : `${toolName} writes to the live Shopify store`;
	},
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
	if (!result) return;
	const output = { hookEventName: 'PreToolUse', permissionDecision: result.decision, permissionDecisionReason: result.reason };
	console.log(JSON.stringify({ hookSpecificOutput: output }));
}

if (isMainModule(import.meta.url)) run();
