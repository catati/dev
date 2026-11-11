import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { RepoError, git, repoRoot } from './repo.mjs';

const templatesDir = new URL('../templates/', import.meta.url);

const templateCopies = {
	'.github/ISSUE_TEMPLATE/issue.yml': 'issue.yml',
};

const makeTargets = ['install', 'test', 'e2e', 'verify', 'lint', 'help'];

const missing = 'file is missing';

const workflowDir = '.github/workflows/';
const workflowNames = ['ci.yml', 'deploy.yml'];

const isWorkflow = (path) => path.startsWith(workflowDir);

const envs = ['dev', 'prod'];
const otherEnvWords = ['production', 'development', 'staging', 'preview'];

const inNodeModules = (path) => path.split('/').includes('node_modules');
const isWranglerConfig = (path) => basename(path) === 'wrangler.jsonc' && !inNodeModules(path);

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
		pass: ({ files }) => {
			const makefile = files.get('Makefile');
			if (!makefile) return [{ path: 'Makefile', problem: missing }];
			const defined = definedTargets(makefile.toString());
			return makeTargets
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
		reads: () => [],
		pass: ({ paths }) =>
			paths
				.filter((path) => isWorkflow(path) && !workflowNames.includes(path.slice(workflowDir.length)))
				.map((path) => ({ path, problem: 'workflow is not named ci.yml or deploy.yml' })),
	},
	{
		id: 'env-names',
		reads: (paths) => paths.filter((path) => isWranglerConfig(path) || isWorkflow(path) || pathEnvWord(path)),
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
			...paths.flatMap((path) => {
				const word = pathEnvWord(path);
				return word ? [{ path, problem: `path names environment ${word}; use dev or prod` }] : [];
			}),
		],
	},
];

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

function pathEnvWord(path) {
	if (inNodeModules(path)) return undefined;
	return path
		.split('/')
		.flatMap((segment) => [segment, ...segment.split(/[._-]/)])
		.map((token) => token.toLowerCase())
		.find((token) => otherEnvWords.includes(token));
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

export function evaluate({ files, paths, templates, today }) {
	const raw = checks.flatMap(({ id, pass }) => pass({ files, paths, templates }).map((f) => ({ check: id, ...f })));
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
	return { files, paths };
}

export function repoFindings(cwd, planned = new Map()) {
	const { files, paths } = readRepo(cwd);
	for (const [path, bytes] of planned) if (files.has(path)) files.set(path, bytes);
	const templates = new Map(Object.values(templateCopies).map((name) => [name, readFileSync(new URL(name, templatesDir))]));
	const today = new Date().toISOString().slice(0, 10);
	return evaluate({ files, paths, templates, today });
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
