import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { posix } from 'node:path';
import { isMainModule } from './main-module.mjs';

const ACCOUNTS = { dev: '028a7270e2ad8a208cd6b01800f363f3', prod: '69f8dc2296dd15d29e03693d6492f163' };
const APPROVE = 'Approve only if Shien asked for this specific prod action.';
const UNKNOWN = '\u0000';
const ASSIGNMENT = /^([A-Za-z_]\w*)=(.*)$/s;

const RUNNER_VERBS = { exec: 0, dlx: 0, x: 0, run: 0, workspace: 1 };
const RUNNER_VALUES = ['--dir', '-C', '--filter', '-w', '--prefix'];
const runner = ({ value = [], bool = [], shell = [] }) => ({
	value: [...RUNNER_VALUES, ...value],
	bool: ['-y', '--yes', '-s', '--silent', '-r', '--recursive', '--if-present', ...bool],
	shell,
	verbs: RUNNER_VERBS,
});
const npx = runner({ value: ['-p', '--package'], bool: ['--no', '-q', '--quiet'], shell: ['-c', '--call'] });
const KEYWORDS = ['if', 'then', 'elif', 'else', 'fi', 'do', 'done', 'while', 'until', '{', '}', '!'];
const WRAPPERS = {
	...Object.fromEntries(KEYWORDS.map((word) => [word, {}])),
	function: { operands: 1 },
	nohup: {},
	coproc: { name: '{' },
	corepack: {},
	command: { bool: ['-p', '-v', '-V'] },
	exec: { bool: ['-c', '-l'], value: ['-a'] },
	time: { bool: ['-p', '-v'], value: ['-f', '-o', '--format', '--output'] },
	nice: { value: ['-n', '--adjustment'] },
	stdbuf: { value: ['-i', '-o', '-e', '--input', '--output', '--error'] },
	timeout: { bool: ['-v', '--foreground'], value: ['-k', '-s', '--kill-after', '--signal'], operands: 1 },
	sudo: { bool: ['-E', '-H', '-n', '-S', '-k', '-b', '-i', '-s', '-P'], value: ['-u', '-g', '-C', '-D', '-h', '-p'] },
	env: { bool: ['-', '-i', '-0', '-v', '--ignore-environment'], value: ['-u', '-C', '--unset', '--chdir'] },
	xargs: { bool: ['-0', '-r', '-t', '-p', '-x'], value: ['-I', '-n', '-P', '-L', '-d', '-E', '-s'], appends: true },
	...{ npx, pnpx: npx, bunx: npx },
	pnpm: runner({ value: ['-F'], bool: ['--workspace-root', '--parallel', '--stream'], shell: ['-c', '--shell-mode'] }),
	npm: runner({ value: ['--workspace', '--loglevel'], shell: ['-c', '--call'] }),
	yarn: runner({ value: ['--cwd'] }),
	bun: runner({ value: ['--cwd', '-F'] }),
};
const PROGRAM_ALIASES = { '@shopify/cli': 'shopify' };
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'eval', 'source', '.']);
const SHELL_VALUES = ['-o', '+o', '-O', '+O', '--rcfile', '--init-file'];
const OPENERS = ['if', 'case', 'while', 'until', 'for', 'select', '{'];
const CLOSERS = ['fi', 'esac', 'done', '}'];
const leads = (words) => words.every((word, i) => KEYWORDS.includes(word) || [word, words[i - 1]].includes('coproc'));
const BRACE = /^([^\s;&|<>(){}]*?(,|\.\.)[^\s;&|<>()]*?\}|[A-Za-z_]\w*\}[<>])/;
const COUNT_FLAGS = new Set('grep egrep fgrep rg wc head tail jq sort uniq cut ls cat diff'.split(' '));

const WRANGLER_GLOBAL_VALUES = ['--env', '-e', '--config', '-c', '--cwd', '--env-file'];
const WRANGLER_READS = [
	'tail|whoami|dev|login|logout|types|docs|help|secret list|versions secret list|versions list|versions view',
	'deployments list|deployments status|deployments view|kv namespace list|kv key list|kv key get|r2 bucket list',
	'r2 bucket info|r2 object get|d1 list|d1 info|d1 export|d1 migrations list|d1 migrations create|d1 time-travel info',
	'queues list|queues info|pages project list|pages deployment list|pages deployment tail|workflows list',
	'workflows describe|workflows instances list|workflows instances describe',
].flatMap((line) => line.split('|'));
const WRANGLER_LOCAL_STORES = ['d1', 'kv', 'r2'];
const HELP_FLAGS = ['--help', '-h', '--version', '-v'];
const TERRAFORM_WRITES = new Set(['apply', 'destroy', 'import', 'refresh', 'test', 'taint', 'untaint', 'force-unlock']);
const TERRAFORM_SUBCOMMAND_WRITES = {
	state: ['rm', 'mv', 'push', 'replace-provider'],
	workspace: ['delete', 'new', 'select'],
};
const SHOPIFY_DEV_THEME = ['--development', '-d', '--unpublished', '-u'];
const SHOPIFY_LIVE_THEME = ['--publish', '--live', '-l', '--allow-live', '-a'];
const SHOPIFY_DEV_CONFIGS = ['dev', 'shopify.app.dev.toml'];
const SHOPIFY_READS = 'get list search find show generate validate graphql_query graphql_schema'.split(' ');
const MAKE_VALUE_FLAGS = ['-C', '-f', '-I', '-o', '-W', '--directory', '--file'];
const MAKE_WRITE = /deploy|apply|migrate|release/;
const GH_VALUE_FLAGS = '-R --repo -r --ref -f -F --field --raw-field -X --method -H --header'.split(' ');
const DEPLOY_WORKFLOW_PARTS = ['deploy', 'apply', 'prod', 'production'];
const DEPLOY_CALL = /\/rerun|pending_deployments|(^|\/)repos\/[^/\s]+\/[^/\s]+\/dispatches\b/;
const WORKFLOW_DISPATCH = /\/actions\/workflows\/([^/?\s]+)\/dispatches/;
const SQL_WRITE_WORDS = 'INSERT|UPDATE|DELETE|REPLACE|UPSERT|DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX';
const SQL_WRITE = new RegExp(`\\b(${SQL_WRITE_WORDS}|BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\\b`, 'i');
const D1_QUERY_PATH = /\/d1\/database\/[^/'"`\s]+\/(query|raw)\b/;
const SQL_LITERAL = /\bsql\b['"]?\s*:\s*("(?:[^"\\\n]|\\.)*"|'[^'\\\n]*'|`[^`\\$]*`)/;

function text(value, name) {
	if (typeof value !== 'string') throw new TypeError(`${name} is ${JSON.stringify(value)}, not a string`);
	return value;
}

const isReadSql = (sql) =>
	/^\s*(SELECT|WITH|EXPLAIN)\b/i.test(sql) && !/;(?!\s*$)/.test(sql) && !/--|\/\*/.test(sql) && !SQL_WRITE.test(sql);
const nameParts = (path) => posix.basename(path).toLowerCase().split(/[^a-z0-9]+/);
const isProdName = (name) => nameParts(name).some((part) => part === 'prod' || part === 'production');
const hasProdSegment = (path) => path.split('/').includes('prod');
const show = (words) => words.join(' ').replaceAll(UNKNOWN, '$…');

function parse(command) {
	const segments = [];
	const unread = [];
	let pos = 0;
	const take = (pattern) => {
		const found = pattern.exec(command.slice(pos))?.[0] ?? '';
		pos += found.length;
		return found;
	};

	function expansion(mark) {
		const name = take(/^(\{[^}]*\}|[A-Za-z_]\w*|[0-9@*#?$!-])/).replace(/^\{(.*)\}$/, '$1');
		if (!/^([A-Za-z_]\w*|[0-9@*#?$!-]?)$/.test(name)) mark('a ${…} expansion has an operator');
		return name === '' ? '$' : name === 'HOME' ? homedir() : UNKNOWN;
	}

	function substitute(closer, node) {
		if (!read(closer, { parent: node, sub: true })) unread.push({ why: 'a substitution is not closed', text: command });
		return UNKNOWN;
	}

	function arithmetic(mark) {
		mark('it runs (( )) arithmetic');
		let open = 0;
		do open += { '(': 1, ')': -1 }[command[pos++]] ?? 0;
		while (open > 0 && pos < command.length);
		if (open > 0) unread.push({ why: 'an arithmetic expression is not closed', text: command });
		return UNKNOWN;
	}

	function heredoc(segment) {
		const strip = take(/^<-?[ \t]*/).includes('-');
		const raw = take(/^[^\s;&|()<>]+/);
		return { delimiter: raw.replace(/['"\\]/g, ''), quoted: /['"\\]/.test(raw), strip, segment };
	}

	function readBodies(pending) {
		for (const doc of pending.splice(0)) {
			const lines = [];
			let closed = false;
			while (pos < command.length && !closed) {
				const line = take(/^[^\n]*/);
				pos++;
				closed = (doc.strip ? line.replace(/^\t+/, '') : line) === doc.delimiter;
				if (!closed) lines.push(line);
			}
			const body = lines.join('\n');
			if (!closed) unread.push({ why: `the heredoc ${doc.delimiter} is not closed`, text: command });
			if (!doc.quoted && /\$\(|`/.test(body)) unread.push({ why: 'a heredoc body runs a substitution', text: body });
			doc.segment.heredocs.push(body);
		}
	}

	function read(closer, parent) {
		let node = parent;
		const fresh = (piped) => ({ words: [], heredocs: [], start: pos, node: piped ? { parent: node, sub: true } : node });
		let segment = fresh(false);
		let word = null;
		let quote = null;
		let depth = 0;
		let redirect = false;
		const pending = [];
		const add = (part) => (word = (word ?? '') + part);
		const mark = (why) => (segment.unread ??= why);
		const endWord = () => {
			const first = word !== null && !redirect && leads(segment.words);
			if (first && word === 'coproc') segment.node = { parent: segment.node, sub: true };
			else if (first && OPENERS.includes(word)) node = segment.node = { parent: segment.node, back: node };
			else if (first && CLOSERS.includes(word) && node.back && !node.paren) [segment.closes, node] = [node, node.back];
			if (word !== null && !redirect) segment.words.push(word);
			if (word !== null) redirect = false;
			word = null;
		};
		const endSegment = (piped = false) => {
			endWord();
			if (segment.unread) unread.push({ why: segment.unread, text: command.slice(segment.start, pos) });
			if (segment.words.length) segments.push(segment);
			segment = fresh(piped);
		};
		while (pos < command.length) {
			const c = command[pos++];
			if (quote === "'") {
				if (c === "'") quote = null;
				else add(c);
			} else if (c === '\\') {
				const next = command[pos++] ?? '';
				if (next !== '\n') add((quote === '"' && !'$`"\\'.includes(next) ? c : '') + next);
			} else if (c === closer && quote === null && (closer === '`' || depth === 0)) {
				endSegment();
				return true;
			} else if (c === '`') add(substitute('`', node));
			else if (c === '$' && command[pos] === '(' && command[pos + 1] === '(') add(arithmetic(mark));
			else if (c === '$' && command[pos] === '(') {
				pos++;
				add(substitute(')', node));
			} else if (c === '$' && quote === null && `'"`.includes(command[pos])) {
				mark(`a word uses $${command[pos]}…${command[pos]} quoting`);
				add(UNKNOWN);
			} else if (c === '$') add(expansion(mark));
			else if (quote === '"') {
				if (c === '"') quote = null;
				else add(c);
			} else if (c === "'" || c === '"') {
				quote = c;
				add('');
			} else if (c === '~' && word === null && /^($|[/\s;&|)])/.test(command.slice(pos))) add(homedir());
			else if (c === '#' && word === null) {
				while (pos < command.length && command[pos] !== '\n') pos++;
			} else if ('<>'.includes(c) && command[pos] === '(') {
				pos++;
				mark('it reads a process substitution');
				add(substitute(')', node));
			} else if (c === '(' && command[pos] === '(' && word === null) {
				pos--;
				arithmetic(mark);
			} else if (c === '<' && command[pos] === '<' && command[pos + 1] !== '<') {
				endWord();
				pending.push(heredoc(segment));
			} else if ('<>'.includes(c) || (c === '&' && command[pos] === '>')) {
				if (/^\d+$/.test(word ?? '')) word = null;
				endWord();
				while ('<>&|'.includes(command[pos] ?? 'x')) pos++;
				redirect = true;
			} else if (';&|\n()'.includes(c)) {
				endWord();
				const doubled = '&|'.includes(c) && command[pos] === c;
				if (doubled || (c === '|' && command[pos] === '&')) pos++;
				const piped = c === '|' && !doubled;
				if (piped || (c === '&' && !doubled)) {
					if (segment.closes) segment.closes.sub = true;
					segment.node = { parent: segment.node, sub: true };
				}
				if (c === '(') [depth, node] = [depth + 1, { parent: node, back: node, sub: true, paren: true }];
				if (c === ')') [depth, node] = [Math.max(0, depth - 1), node.paren ? node.back : node];
				endSegment(piped);
				if (c === '\n') readBodies(pending);
			} else if (/\s/.test(c)) endWord();
			else {
				if (c === '{' && BRACE.test(command.slice(pos))) mark('it uses brace expansion or a {name} redirect');
				add(c);
			}
		}
		if (quote !== null) unread.push({ why: 'a quote is not closed', text: command });
		endSegment();
		readBodies(pending);
		return closer === null;
	}

	read(null, {});
	return { segments, unread };
}

function programName(word) {
	const bare = word?.replace(/(.)@[^/]*$/, '$1');
	return PROGRAM_ALIASES[bare] ?? bare?.split('/').at(-1);
}

const isJudgedProgram = (word) => Object.hasOwn(PROGRAM_RULES, programName(word) ?? '');
const namedProgram = (source) =>
	source.split(/[^\w@./\u0000]+/).find(isJudgedProgram) ?? /deploy\.ya?ml/.exec(source)?.[0];

function flagWidth(words, i, spec) {
	const [flag, next] = [words[i], words[i + 1]];
	const short = /^-[^-]/.test(flag);
	if (spec.bool?.includes(flag)) return 1;
	const verbOrProgram = Object.hasOwn(spec.verbs ?? {}, next) || isJudgedProgram(next);
	if (spec.value?.includes(flag)) return spec.verbs && verbOrProgram ? 1 : 2;
	if (flag.includes('=') && [...(spec.value ?? []), ...(spec.bool ?? [])].includes(flag.split('=')[0])) return 1;
	if (short && spec.value?.includes(flag.slice(0, 2))) return 1;
	return short && [...flag.slice(1)].every((letter) => spec.bool?.includes(`-${letter}`)) ? 1 : 0;
}

function readFlags(words, i, spec) {
	while (words[i]?.startsWith('-')) {
		if (words[i] === '--') return { next: i + 1 };
		if (spec.shell?.includes(words[i])) return { next: words.length, shell: words.slice(i + 1).join(' ') };
		const width = flagWidth(words, i, spec);
		if (width === 0) return { next: i, unknown: words[i] };
		i += width;
	}
	return { next: i };
}

function unwrap(words, inherited) {
	const env = { ...inherited };
	const shells = [];
	let appended = [];
	let i = 0;
	for (;;) {
		const assignment = ASSIGNMENT.exec(words[i] ?? '');
		if (assignment) {
			env[assignment[1]] = assignment[2];
			i++;
			continue;
		}
		const name = programName(words[i]);
		if (!Object.hasOwn(WRAPPERS, name ?? '')) break;
		const spec = WRAPPERS[name];
		let flags = readFlags(words, i + 1, spec);
		i = flags.next + (spec.operands ?? 0) + (spec.name && words[flags.next + 1] === spec.name ? 1 : 0);
		while (!flags.unknown && Object.hasOwn(spec.verbs ?? {}, words[i])) {
			flags = readFlags(words, i + 1 + spec.verbs[words[i]], spec);
			i = flags.next;
		}
		if (flags.shell !== undefined) shells.push(flags.shell);
		if (spec.appends) appended = [UNKNOWN];
		if (flags.unknown) return { unknown: flags.unknown, rest: words.slice(flags.next), env, shells };
	}
	return { program: programName(words[i]), args: [...words.slice(i + 1), ...appended], env, shells };
}

const flagValue = (arg, next, name) =>
	arg === name ? [next] : arg.startsWith(`${name}=`) ? [arg.slice(name.length + 1)] : [];
const flagValues = (args, names) =>
	args.flatMap((arg, i) => names.flatMap((name) => flagValue(arg, args[i + 1], name)));
const flagOn = (args, name) =>
	args.reduce((on, arg, i) => {
		if (arg === name || arg === `${name}=true`) return arg !== name || args[i + 1] !== 'false';
		return arg.startsWith(`${name}=`) || arg === `--no-${name.slice(2)}` ? false : on;
	}, false);
const positional = (args, valueFlags = []) =>
	args.filter((arg, i) => !arg.startsWith('-') && !valueFlags.includes(args[i - 1]));

function resolveDir(cwd, path) {
	if (path.includes(UNKNOWN) || path.startsWith('~') || path === '-') return null;
	if (path.startsWith('/')) return posix.resolve(path);
	return cwd === null ? null : posix.resolve(cwd, path);
}

const changeDir = (cwd, target) => (target === undefined ? homedir() : resolveDir(cwd, target));

function isDeployWorkflow(name) {
	if (name === undefined) return false;
	if (name.includes(UNKNOWN)) return true;
	const base = String(name).split('/').at(-1).replace(/\.ya?ml$/i, '');
	return /^\d+$/.test(base) || nameParts(base).some((part) => DEPLOY_WORKFLOW_PARTS.includes(part));
}

const PROGRAM_RULES = {
	wrangler(args, { env }) {
		const path = positional(args, WRANGLER_GLOBAL_VALUES);
		const command = path.join(' ');
		if (path.length === 0 || args.some((arg) => HELP_FLAGS.includes(arg))) return null;
		const lead = args.slice(0, args.indexOf(path[0]));
		const known = (arg, i) => [arg, lead[i - 1], arg.split('=')[0]].some((flag) => WRANGLER_GLOBAL_VALUES.includes(flag));
		const isRead = WRANGLER_READS.some((read) => command === read || command.startsWith(`${read} `));
		if (isRead && lead.every(known)) return null;
		if (flagOn(args, '--dry-run')) return null;
		const remote = args.some((arg) => arg.startsWith('--remote'));
		if (flagOn(args, '--local') && !remote && WRANGLER_LOCAL_STORES.includes(path[0].split(':')[0])) return null;
		const sql = flagValues(args, ['--command']);
		const oneReadSql = sql.length === 1 && flagValues(args, ['--file']).length === 0 && isReadSql(sql[0]);
		if (command.startsWith('d1 execute') && oneReadSql) return null;
		const envs = flagValues(args, ['--env', '-e']);
		const attached = args.find((arg) => /^-[ec][^=]/.test(arg));
		const prodConfig = flagValues(args, ['--config', '-c']).find(isProdName);
		const account = env.CLOUDFLARE_ACCOUNT_ID ?? '';
		const prodAccount = account === ACCOUNTS.prod || account.includes(UNKNOWN);
		const devEnv = envs.length ? envs.every((name) => name === 'dev') : env.CLOUDFLARE_ENV === 'dev';
		if (devEnv && !prodAccount && !prodConfig && !attached) return null;
		const because = [
			[prodAccount, 'CLOUDFLARE_ACCOUNT_ID is the Catati id or unknown'],
			[attached, `the guard does not read the attached value of ${attached}`],
			[prodConfig, `--config ${prodConfig} is a prod config`],
			[envs.length, `--env ${envs.join(', ')} is not dev`],
			[true, 'no --env targets the production Worker'],
		].find(([holds]) => holds)[1];
		return `This Wrangler command is not a known read and writes to production, because ${because}`;
	},
	terraform(args, { cwd }) {
		const [command, subcommand] = positional(args);
		const unknown = `${command} ${subcommand}`.includes(UNKNOWN);
		const writes = unknown || TERRAFORM_WRITES.has(command) || TERRAFORM_SUBCOMMAND_WRITES[command]?.includes(subcommand);
		if (!writes) return null;
		const root = resolveDir(cwd, flagValues(args, ['-chdir']).at(-1) ?? '.');
		if (root === null) return `This Terraform ${command} runs in a directory the guard cannot resolve`;
		return hasProdSegment(root) ? `This Terraform ${command} changes the prod root ${root}` : null;
	},
	shopify(args) {
		const has = (...words) => words.some((word) => args.includes(word));
		const configs = flagValues(args, ['--config', '-c']);
		const devConfig = configs.length > 0 && configs.every((config) => SHOPIFY_DEV_CONFIGS.includes(config));
		const appWrite = has('deploy', 'release') || (has('config') && has('push'));
		if (has('app') && appWrite && !devConfig) {
			return 'This Shopify app command changes the live app, because a --config is missing or not dev';
		}
		if (has('theme') && has('publish', 'delete')) return 'This Shopify theme command changes the live store theme';
		if (has('theme') && has('push') && (!has(...SHOPIFY_DEV_THEME) || has(...SHOPIFY_LIVE_THEME))) {
			return 'This Shopify theme push writes to a live theme, because it names --publish or --live, or no dev theme';
		}
		return null;
	},
	make(args, { env, cwd }) {
		const prodVariable = [...args, `ENV=${env.ENV}`].some((arg) => /^ENV=prod(uction)?$/.test(arg));
		const dir = resolveDir(cwd, flagValues(args, ['-C', '--directory']).at(-1) ?? '.');
		const prodDir = dir !== null && hasProdSegment(dir);
		const targets = positional(args, MAKE_VALUE_FLAGS).filter((arg) => !arg.includes('='));
		const target = targets.find((name) => MAKE_WRITE.test(name) && (isProdName(name) || prodVariable || prodDir));
		return target ? `make ${target} runs a prod target` : null;
	},
	gh(args) {
		const [group, verb, ...rest] = positional(args, GH_VALUE_FLAGS);
		if (group === 'workflow' && verb === 'run' && rest.some(isDeployWorkflow)) return 'This starts a deploy workflow';
		if (group === 'run' && verb === 'rerun') {
			return 'This reruns a GitHub Actions run, and the guard cannot tell whether that run deploys';
		}
		return PROGRAM_RULES.curl(args);
	},
	curl(args) {
		const path = args.find(
			(arg) => DEPLOY_CALL.test(arg) || isDeployWorkflow(WORKFLOW_DISPATCH.exec(arg)?.[1]),
		);
		return path ? `This calls ${path}, which can start, rerun or approve a deploy` : null;
	},
};
PROGRAM_RULES.tofu = PROGRAM_RULES.terraform;

function assign(args, scope) {
	for (const match of args.map((arg) => ASSIGNMENT.exec(arg)).filter(Boolean)) scope.env[match[1]] = match[2];
}

const SCOPE_RULES = {
	cd: (args, scope) => (scope.cwd = changeDir(scope.cwd, args.find((arg) => !/^-[LPe@]+$/.test(arg)))),
	popd: (args, scope) => (scope.cwd = null),
	...Object.fromEntries(['export', 'declare', 'typeset', 'local', 'readonly'].map((word) => [word, assign])),
};
SCOPE_RULES.pushd = SCOPE_RULES.cd;

function cannotRead(why, source) {
	const named = namedProgram(source);
	return named ? `The prod guard cannot fully read this command, because ${why}, and it names ${named}` : null;
}

function judgeShell(program, args, heredocs, scope, env, command) {
	const operands = args[0] === '--' ? args.slice(1) : args;
	if (program === 'eval') return judgeBash(operands.join(' '), scope);
	const inShell = program === 'source' || program === '.';
	const child = () => (inShell ? scope : { cwd: scope.cwd, env: { ...env } });
	let i = 0;
	while (!inShell && /^[-+]/.test(args[i] ?? '') && args[i] !== '--') i += SHELL_VALUES.includes(args[i]) ? 2 : 1;
	const [options, string] = [args.slice(0, i), args[i] === '--' ? args[i + 1] : args[i]];
	if (options.some((option) => /^-[A-Za-z]*c/.test(option))) {
		return string === undefined ? cannotRead('it cannot find the -c string', command) : judgeBash(string, child());
	}
	if (heredocs.length) return heredocs.map((body) => judgeBash(body, child())).find(Boolean) ?? null;
	const stdin = inShell
		? operands[0] === undefined || /^(\/dev\/stdin|\/dev\/fd\/0|-)$|\u0000/.test(operands[0])
		: string === undefined || options.some((option) => /^-[A-Za-z]*s/.test(option));
	return stdin ? cannotRead(`${program} reads commands from its input`, command) : null;
}

function judgeSegment({ words, heredocs }, scope, command) {
	const unwrapped = unwrap(words, scope.env);
	if (unwrapped.unknown) return cannotRead(`it does not know the flag ${unwrapped.unknown}`, unwrapped.rest.join(' '));
	const { program, args, env, shells } = unwrapped;
	for (const shell of shells) {
		const found = judgeBash(shell, { cwd: scope.cwd, env: { ...env } });
		if (found) return found;
	}
	if (words.every((part) => ASSIGNMENT.test(part))) scope.env = env;
	if (program === undefined) return null;
	if (program.includes(UNKNOWN)) return cannotRead('its program word is an expansion', command);
	if (Object.hasOwn(SCOPE_RULES, program)) SCOPE_RULES[program](args, scope);
	if (SHELLS.has(program)) return judgeShell(program, args, heredocs, scope, env, command);
	if (Object.hasOwn(PROGRAM_RULES, program)) {
		const action = PROGRAM_RULES[program](args, { env, cwd: scope.cwd });
		return action && `${action} (${show(words)})`;
	}
	const flag = args.indexOf('-c');
	const counts = COUNT_FLAGS.has(program) || (program === 'git' && args.slice(0, flag).includes('grep'));
	return flag === -1 || counts ? null : cannotRead(`it does not read the -c string of ${program}`, args[flag + 1] ?? '');
}

function judgeBash(command, scope) {
	const { segments, unread } = parse(command);
	const stateOf = (node) => {
		if (!node.parent) return scope;
		const outer = stateOf(node.parent);
		return node.sub ? (node.state ??= { cwd: outer.cwd, env: { ...outer.env } }) : outer;
	};
	for (const segment of segments) {
		const action = judgeSegment(segment, stateOf(segment.node), command);
		if (action) return action;
	}
	return unread.map(({ why, text: source }) => cannotRead(why, source)).find(Boolean) ?? null;
}

function judgeCloudflare(input) {
	const code = text(input.code, 'mcp__cloudflare__execute code');
	const devOnly = input.account_id === ACCOUNTS.dev && !code.includes(ACCOUNTS.prod) && !code.includes('/zones');
	if (devOnly) return null;
	const methods = [...code.matchAll(/\bmethod\b(?:['"]?\s*:\s*(['"])(\w+)\1)?/g)].map((match) => match[2] ?? 'unknown');
	const writes = methods.filter((method) => method !== 'GET');
	if (writes.length === 0) return null;
	const sqlKeys = code.match(/\bsql\b/g) ?? [];
	const paths = [...code.matchAll(/\bpath\b(?:['"]?\s*:\s*(['"`])([^'"`]*)\1)?/g)];
	const d1Request = paths.length === 1 && D1_QUERY_PATH.test(paths[0][2] ?? '');
	const literal = SQL_LITERAL.exec(code)?.[1];
	const sql = literal === undefined ? null : literal.startsWith('"') ? JSON.parse(literal) : literal.slice(1, -1);
	const oneReadQuery = writes.length === 1 && writes[0] === 'POST' && d1Request;
	if (oneReadQuery && sqlKeys.length === 1 && sql !== null && isReadSql(sql)) return null;
	const accounts = { undefined: 'names no account', [ACCOUNTS.dev]: 'writes a zone or names the Catati account' };
	const account = accounts[input.account_id] ?? `runs on account ${input.account_id}, not catati-dev`;
	return `This Cloudflare connector call has method ${writes.join(', ')} and ${account}`;
}

const RERUN = 'reruns a GitHub Actions run, and the guard cannot tell whether that run deploys';
const ACTIONS_METHODS = {
	run_workflow: (input) =>
		isDeployWorkflow(text(input.workflow_id, 'workflow_id')) ? `This runs the ${input.workflow_id} workflow` : null,
	rerun_workflow_run: () => `This ${RERUN}`,
	rerun_failed_jobs: () => `This ${RERUN.replace('reruns', 'reruns failed jobs of')}`,
	cancel_workflow_run: () => null,
	delete_workflow_run_logs: () => null,
};

const TOOL_RULES = {
	Bash: (input, cwd) => judgeBash(text(input.command, 'Bash command'), { cwd: cwd ?? null, env: {} }),
	mcp__cloudflare__execute: judgeCloudflare,
	mcp__Shopify__: (input, cwd, toolName) => {
		const mutation = toolName === 'mcp__Shopify__graphql_query' && /\bmutation\b/.test(JSON.stringify(input));
		if (mutation) return `${toolName} runs a mutation on the live Shopify store`;
		const read = SHOPIFY_READS.some((prefix) => toolName.startsWith(`mcp__Shopify__${prefix}`));
		return read ? null : `${toolName} writes to the live Shopify store`;
	},
	mcp__github__actions_run_trigger: (input) => {
		const method = text(input.method, 'actions_run_trigger method');
		if (!Object.hasOwn(ACTIONS_METHODS, method)) throw new TypeError(`actions_run_trigger method ${method} is unknown`);
		return ACTIONS_METHODS[method](input);
	},
};

export const JUDGED_TOOLS = Object.keys(TOOL_RULES);

export function decide(toolName, toolInput, cwd) {
	const matches = (tool) => tool === toolName || (tool.endsWith('__') && String(toolName).startsWith(tool));
	const key = JUDGED_TOOLS.find(matches);
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
		const reason = `The prod guard could not read this call (${error?.message ?? error}). ${APPROVE}`;
		result = { decision: 'ask', reason };
	}
	if (!result) return;
	const { decision: permissionDecision, reason: permissionDecisionReason } = result;
	const hookSpecificOutput = { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason };
	console.log(JSON.stringify({ hookSpecificOutput }));
}

if (isMainModule(import.meta.url)) run();
