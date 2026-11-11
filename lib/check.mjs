import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { RepoError, git, repoRoot } from './repo.mjs';

const templatesDir = new URL('../templates/', import.meta.url);

const templateCopies = {
	'.github/ISSUE_TEMPLATE/issue.yml': 'issue.yml',
};

const makeTargets = ['install', 'test', 'e2e', 'verify', 'lint', 'help'];
const deployTargets = ['deploy-dev'];

const missing = 'file is missing';

const workflowDir = '.github/workflows/';
const workflowNames = ['ci.yml', 'deploy.yml'];

const isWorkflow = (path) => path.startsWith(workflowDir) && /\.ya?ml$/.test(path);
const isMisnamedWorkflow = (path) => isWorkflow(path) && !workflowNames.includes(path.slice(workflowDir.length));

const envs = ['dev', 'prod'];
const otherEnvWords = ['production', 'development', 'staging', 'preview'];

const secretEnvTokens = ['DEV', 'PROD', 'PRODUCTION', 'DEVELOPMENT', 'STAGING', 'CATATI'];

const remoteWranglerCommands = ['deploy', 'versions', 'secret', 'triggers', 'rollback'];
const wranglerValueFlags = ['--config', '-c', '--cwd', '--env', '-e', '--name', '--message', '--var', '--tag', '--define', '--route', '--outdir', '--compatibility-date', '--assets'];
const outputCommands = ['echo', 'printf'];

const resourcePaths = [
	['name'],
	['d1_databases', [], 'database_name'],
	['r2_buckets', [], 'bucket_name'],
	['queues', 'producers', [], 'queue'],
	['queues', 'consumers', [], 'queue'],
	['queues', 'consumers', [], 'dead_letter_queue'],
	['workflows', [], 'name'],
];
const envSuffix = /-(dev|prod|production|development|staging)$/;

const inNodeModules = (path) => path.split('/').includes('node_modules');
const envWordPattern = otherEnvWords.join('|');
const envConfigName = new RegExp(`^(?:.+\\.(${envWordPattern})\\.(?:toml|json|jsonc|yaml|yml)|\\.env\\.(${envWordPattern})|\\.dev\\.vars\\.(${envWordPattern}))$`, 'i');
const isWranglerConfig = (path) => basename(path) === 'wrangler.jsonc' && !inNodeModules(path);
const isCommandFile = (path) => ['package.json', 'Makefile', 'builds.json'].includes(basename(path)) && !inNodeModules(path);

export const checks = [
	{
		id: 'templates-equal',
		reads: () => Object.keys(templateCopies),
		pass: ({ files, templates }) =>
			Object.entries(templateCopies).flatMap(([path, name]) => {
				const actual = files.get(path);
				if (!actual) return [{ path, problem: missing }];
				if (!actual.equals(templates.get(name))) return [{ path, problem: `differs from templates/${name}` }];
				return [];
			}),
	},
	{
		id: 'make-targets',
		reads: () => ['Makefile'],
		pass: ({ files, paths }) => {
			const makefile = files.get('Makefile');
			if (!makefile) return [{ path: 'Makefile', problem: missing }];
			const defined = definedTargets(makefile.toString());
			return [...makeTargets, ...(paths.some(isWranglerConfig) ? deployTargets : [])]
				.filter((target) => !defined.has(target))
				.map((target) => ({ path: 'Makefile', problem: `no target ${target}` }));
		},
	},
	{
		id: 'ci-workflow',
		reads: () => ['.github/workflows/ci.yml'],
		pass: ({ files }) => (files.get('.github/workflows/ci.yml') ? [] : [{ path: '.github/workflows/ci.yml', problem: missing }]),
	},
	{
		id: 'env-example',
		reads: (paths) => paths.filter(isMisnamedEnvTemplate),
		pass: ({ paths }) =>
			paths.filter(isMisnamedEnvTemplate).map((path) => ({ path, problem: 'env template is not named .env.example' })),
	},
	{
		id: 'workflow-names',
		reads: (paths) => paths.filter(isMisnamedWorkflow),
		pass: ({ paths }) =>
			paths
				.filter(isMisnamedWorkflow)
				.map((path) => ({ path, problem: 'workflow is not named ci.yml or deploy.yml' })),
	},
	{
		id: 'env-names',
		reads: (paths) => paths.filter((path) => isWranglerConfig(path) || isWorkflow(path) || configEnvWord(path)),
		pass: ({ files, paths }) => [
			...paths.filter(isWranglerConfig).flatMap((path) =>
				Object.keys(asObject(parseJsonc(files.get(path)))?.env ?? {})
					.filter((key) => !envs.includes(key))
					.map((key) => ({ path, problem: `env key ${key} is not dev or prod` })),
			),
			...paths.filter(isWorkflow).flatMap((path) =>
				workflowEnvironments(files.get(path)).flatMap((name) => {
					const problem = environmentProblem(name);
					return problem ? [{ path, problem }] : [];
				}),
			),
			...[...paths.map((path) => [path, configEnvWord(path)]), ...terraformRoots(paths).map((root) => [root, rootEnvWord(root)])]
				.filter(([, word]) => word)
				.map(([path, word]) => ({ path, problem: `path names environment ${word}; use dev or prod` })),
		],
	},
	{
		id: 'secret-names',
		reads: (paths) => paths.filter(isWorkflow),
		pass: ({ files, paths }) =>
			paths.filter(isWorkflow).flatMap((path) =>
				[...new Set([...(files.get(path)?.toString() ?? '').matchAll(/\bsecrets\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]))]
					.filter((name) => name.toUpperCase().split('_').some((token) => secretEnvTokens.includes(token)))
					.map((name) => ({ path, problem: `secret ${name} names an environment or the org; name it for what it holds` })),
			),
	},
	{
		id: 'wrangler-envs',
		reads: (paths) => paths.filter((path) => isWranglerConfig(path) || isCommandFile(path)),
		pass: ({ files, paths }) => [
			...paths.filter(isWranglerConfig).flatMap((path) => wranglerConfigProblems(parseJsonc(files.get(path))).map((problem) => ({ path, problem }))),
			...paths.filter(isCommandFile).flatMap((path) =>
				[...new Set(commands(path, files.get(path)).flatMap(wranglerCommandProblems))].map((problem) => ({ path, problem })),
			),
		],
	},
	{
		id: 'resource-names',
		reads: (paths) => paths.filter(isWranglerConfig),
		pass: ({ files, paths, repo }) => {
			if (!repo) return [];
			const named = new RegExp(`^${repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(-[a-z0-9]+)*$`);
			return paths.filter(isWranglerConfig).flatMap((path) =>
				[...new Set(resourceNames(parseJsonc(files.get(path))))]
					.filter((name) => !named.test(name) || envSuffix.test(name))
					.map((name) => ({ path, problem: `resource ${name} is not ${repo}-<component> with no environment suffix` })),
			);
		},
	},
];

function wranglerConfigProblems(config) {
	if (!asObject(config)) return ['cannot parse as JSONC'];
	return envs.flatMap((env) => {
		const settings = asObject(asObject(config.env)?.[env]);
		if (!settings) return [`no env.${env}`];
		return ['name', 'account_id'].filter((key) => typeof settings[key] !== 'string').map((key) => `env.${env} has no ${key}`);
	});
}

function valuesAt(value, path) {
	if (path.length === 0) return [value];
	const [step, ...rest] = path;
	if (Array.isArray(step)) return Array.isArray(value) ? value.flatMap((item) => valuesAt(item, rest)) : [];
	const object = asObject(value);
	return object && step in object ? valuesAt(object[step], rest) : [];
}

function resourceNames(config) {
	const scopes = [config, ...Object.values(asObject(asObject(config)?.env) ?? {})];
	return scopes.flatMap((scope) => resourcePaths.flatMap((path) => valuesAt(scope, path))).filter((name) => typeof name === 'string');
}

function stringsAt(value, keys) {
	if (Array.isArray(value)) return value.flatMap((item) => stringsAt(item, keys));
	if (!asObject(value)) return [];
	return Object.entries(value).flatMap(([key, item]) => (keys.includes(key) && typeof item === 'string' ? [item] : stringsAt(item, keys)));
}

function commands(path, bytes) {
	if (!bytes) return [];
	const name = basename(path);
	if (name === 'Makefile') return recipeLines(bytes.toString());
	const parsed = parseJsonc(bytes);
	if (name === 'builds.json') return stringsAt(parsed, ['deploy_command', 'build_command']);
	return Object.values(asObject(asObject(parsed)?.scripts) ?? {}).filter((script) => typeof script === 'string');
}

function recipeLines(makefile) {
	const lines = makefile.replace(/\\\n/g, ' ').split('\n');
	const variables = makeVariables(lines);
	return lines.filter((line) => line.startsWith('\t') && !line.trim().startsWith('#')).map((line) => expandVariables(line, variables));
}

function makeVariables(lines) {
	const variables = new Map();
	for (const line of lines) {
		const match = line.match(/^(?:[^\s#:=][^#:=]*?:\s*)?(?:(?:export|override|private)\s+)*([A-Za-z_][A-Za-z0-9_]*)\s*(\+=|\?=|::?=|=)(.*)$/);
		if (!match) continue;
		const [, name, op, raw] = match;
		const value = raw.replace(/#.*$/, '').trim();
		if (op === '+=') variables.set(name, [variables.get(name), value].filter(Boolean).join(' '));
		else if (op !== '?=' || !variables.has(name)) variables.set(name, value);
	}
	return variables;
}

function expandVariables(line, variables) {
	let expanded = line;
	for (let pass = 0; pass < 10; pass++) {
		const next = expanded.replace(/\$(?:\(([A-Za-z_][A-Za-z0-9_]*)\)|\{([A-Za-z_][A-Za-z0-9_]*)\})/g, (ref, paren, brace) => variables.get(paren ?? brace) ?? ref);
		if (next === expanded) break;
		expanded = next;
	}
	return expanded;
}

function wranglerCommandProblems(command) {
	return command.split(/&&|\|\||;|\|/).flatMap((segment) => {
		const raw = segment.trim().replace(/[()]/g, ' ').trim().split(/\s+/);
		const text = raw.join(' ');
		const words = raw.map((word, i) => (i === 0 ? word.replace(/^[@+-]+/, '') : word).replace(/^(\S*wrangler)@[^/]+$/, '$1'));
		if (outputCommands.includes(words[0])) return [];
		const problems = words.some((word) => word === '--keep-vars' || word.startsWith('--keep-vars=')) ? [`passes --keep-vars: ${text}`] : [];
		const at = words.findIndex((word) => word === 'wrangler' || word.endsWith('/wrangler'));
		if (at === -1) return problems;
		const args = words.slice(at + 1);
		const [sub, ...rest] = args.filter((arg, i) => !arg.startsWith('-') && !wranglerValueFlags.includes(args[i - 1]));
		const remote =
			remoteWranglerCommands.includes(sub) ||
			(sub === 'd1' && rest[0] === 'migrations' && rest[1] === 'apply') ||
			(sub === 'd1' && rest[0] === 'execute' && args.includes('--remote'));
		const hasEnv = args.some((arg) => ['--env', '-e'].includes(arg) || arg.startsWith('--env=') || arg.startsWith('-e='));
		const unexpanded = args.some((arg, i) => /^["']?\$\$?(\w*|\{\w+\})["']?$/.test(arg) && !wranglerValueFlags.includes(args[i - 1]));
		return remote && !hasEnv && !unexpanded ? [...problems, `wrangler ${sub} runs without --env: ${text}`] : problems;
	});
}

function asObject(value) {
	return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function stringEnd(text, start) {
	let i = start + 1;
	while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
	return i + 1;
}

function withoutComments(text) {
	let out = '';
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '"') {
			const end = stringEnd(text, i);
			out += text.slice(i, end);
			i = end - 1;
		} else if (text.startsWith('//', i)) {
			const end = text.indexOf('\n', i);
			i = (end === -1 ? text.length : end) - 1;
		} else if (text.startsWith('/*', i)) {
			const end = text.indexOf('*/', i + 2);
			i = end === -1 ? text.length : end + 1;
			out += ' ';
		} else {
			out += text[i];
		}
	}
	return out;
}

function withoutTrailingCommas(text) {
	let out = '';
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '"') {
			const end = stringEnd(text, i);
			out += text.slice(i, end);
			i = end - 1;
		} else if (!(text[i] === ',' && /^\s*[}\]]/.test(text.slice(i + 1)))) {
			out += text[i];
		}
	}
	return out;
}

function parseJsonc(bytes) {
	if (!bytes) return undefined;
	try {
		return JSON.parse(withoutTrailingCommas(withoutComments(bytes.toString())));
	} catch {
		return undefined;
	}
}

function yamlScalar(value) {
	return value
		.replace(/\s+#.*$/, '')
		.trim()
		.replace(/^(['"])(.*)\1$/, '$2');
}

function workflowEnvironments(bytes) {
	const lines = (bytes?.toString() ?? '').split('\n');
	return lines.flatMap((line, i) => {
		const match = line.match(/^(\s*)(?:-\s+)?environment:(.*)$/);
		if (!match) return [];
		const [, indent, rest] = match;
		const inline = yamlScalar(rest);
		if (inline.startsWith('[')) return [];
		if (inline.startsWith('{')) return [yamlScalar(inline.match(/name:\s*([^,}]+)/)?.[1] ?? '')].filter(Boolean);
		if (inline) return [inline];
		const block = [];
		for (const next of lines.slice(i + 1)) {
			if (next.trim() && next.match(/^\s*/)[0].length <= indent.length) break;
			block.push(next);
		}
		const name = block.map((l) => l.match(/^\s*name:(.*)$/)?.[1]).find((v) => v !== undefined);
		return name === undefined ? [] : [yamlScalar(name)];
	}).filter((name) => !name.includes('${{'));
}

function environmentProblem(name) {
	if (envs.includes(name) || /-(dev|prod)$/.test(name)) return undefined;
	if (/^(dev|prod)-/.test(name)) return `environment ${name} puts the env first; end it in -dev or -prod`;
	return `environment ${name} is not dev or prod and does not end in -dev or -prod`;
}

function configEnvWord(path) {
	if (inNodeModules(path)) return undefined;
	return basename(path).match(envConfigName)?.slice(1).find(Boolean)?.toLowerCase();
}

function terraformRoots(paths) {
	return [...new Set(paths.filter((path) => path.endsWith('.tf') && !inNodeModules(path)).map(dirname))];
}

function rootEnvWord(root) {
	return otherEnvWords.find((word) => word === basename(root).toLowerCase());
}

function definedTargets(makefile) {
	const targets = new Set();
	for (const line of makefile.split('\n')) {
		const match = line.match(/^([^\s#:=][^#:=]*?)\s*(?:::(?!=)|:(?![:=]))/);
		if (match) for (const name of match[1].split(/\s+/)) targets.add(name);
	}
	return targets;
}

function isMisnamedEnvTemplate(path) {
	const name = basename(path);
	return (
		name !== '.env.example' &&
		/(^|[._-])env([._-]|$)/i.test(name) &&
		/(^|[._-])(example|sample|template|tmpl|dist)([._-]|$)/i.test(name)
	);
}

export const allowFile = '.catati-allow';

const allowPattern = /catati-allow\(([a-z0-9-]+)\): ([^;]*\S); expires (\d{4}-\d{2}-\d{2})\b/;

function isCalendarDate(text) {
	const date = new Date(`${text}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

function parseAllows(path, text, today) {
	const allows = [];
	const findings = [];
	for (const line of text.split('\n')) {
		if (!line.includes('catati-allow')) continue;
		const match = line.match(allowPattern);
		const [, check, , expires] = match ?? [];
		if (!match || !checks.some((c) => c.id === check) || !isCalendarDate(expires)) {
			findings.push({ check: 'allow', path, problem: `malformed allow: ${line.trim()}` });
		} else if (expires < today) {
			findings.push({ check: 'allow', path, problem: `catati-allow(${check}) expired ${expires}` });
		} else {
			allows.push(check);
		}
	}
	return { allows, findings };
}

export function evaluate({ files, paths, templates, today, repo }) {
	const raw = checks.flatMap(({ id, pass }) => pass({ files, paths, templates, repo }).map((f) => ({ check: id, ...f })));
	const repoAllows = parseAllows(allowFile, files.get(allowFile)?.toString() ?? '', today);
	const fileAllows = new Map();
	const allowFindings = [...repoAllows.findings];
	for (const path of new Set(raw.map((f) => f.path))) {
		const parsed = parseAllows(path, files.get(path)?.toString() ?? '', today);
		fileAllows.set(path, parsed.allows);
		allowFindings.push(...parsed.findings);
	}
	const kept = raw.filter((f) => !repoAllows.allows.includes(f.check) && !fileAllows.get(f.path).includes(f.check));
	return [...kept, ...allowFindings];
}

function readOptional(root, path) {
	try {
		return readFileSync(join(root, path));
	} catch (error) {
		if (error.code === 'ENOENT' || error.code === 'EISDIR') return undefined;
		throw new RepoError(`cannot read ${path}: ${error.code ?? error.message}`);
	}
}

function readRepo(cwd) {
	const root = repoRoot(cwd);
	const paths = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], root, `git ls-files failed in ${root}`)
		.split('\0')
		.filter(Boolean);
	const wanted = new Set([allowFile, ...checks.flatMap((c) => c.reads(paths))]);
	const files = new Map([...wanted].map((path) => [path, readOptional(root, path)]));
	return { files, paths, repo: originName(root) };
}

function originName(root) {
	try {
		return basename(git(['remote', 'get-url', 'origin'], root, 'no origin remote').trim()).replace(/\.git$/, '');
	} catch (error) {
		if (error instanceof RepoError) return undefined;
		throw error;
	}
}

export function repoFindings(cwd, planned = new Map()) {
	const { files, paths, repo } = readRepo(cwd);
	for (const [path, bytes] of planned) if (files.has(path)) files.set(path, bytes);
	const templates = new Map(Object.values(templateCopies).map((name) => [name, readFileSync(new URL(name, templatesDir))]));
	const today = new Date().toISOString().slice(0, 10);
	return evaluate({ files, paths, templates, today, repo });
}

export function printFindings(findings) {
	for (const { check, path, problem } of findings) console.log(`${check}: ${path}: ${problem}`);
}

export function check(cwd) {
	let findings;
	try {
		findings = repoFindings(cwd);
	} catch (error) {
		if (!(error instanceof RepoError)) throw error;
		console.error(`catati: ${error.message}`);
		return 2;
	}
	printFindings(findings);
	return findings.length > 0 ? 1 : 0;
}
