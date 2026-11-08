import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const templatesDir = new URL('../templates/', import.meta.url);

const templateCopies = {
	'.github/ISSUE_TEMPLATE/issue.yml': 'issue.yml',
	'.github/pull_request_template.md': 'pull_request_template.md',
};

const makeTargets = ['install', 'test', 'e2e', 'verify', 'lint', 'help'];

const missing = 'file is missing';

export const checks = [
	{
		id: 'templates-equal',
		reads: Object.keys(templateCopies),
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
		reads: ['Makefile'],
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
		reads: ['.github/workflows/ci.yml'],
		pass: ({ files }) => (files.get('.github/workflows/ci.yml') ? [] : [{ path: '.github/workflows/ci.yml', problem: missing }]),
	},
	{
		id: 'env-example',
		reads: [],
		pass: ({ paths }) =>
			paths.filter(isMisnamedEnvTemplate).map((path) => ({ path, problem: 'env template is not named .env.example' })),
	},
];

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

export const allowFile = '.catati-dev-allow';

const allowPattern = /catati-dev-allow\(([a-z0-9-]+)\): ([^;]*\S); expires (\d{4}-\d{2}-\d{2})\b/;

function parseAllows(path, text, today) {
	const allows = [];
	const findings = [];
	for (const line of text.split('\n')) {
		if (!line.includes('catati-dev-allow')) continue;
		const match = line.match(allowPattern);
		const [, check, , expires] = match ?? [];
		if (!match || !checks.some((c) => c.id === check) || Number.isNaN(Date.parse(expires))) {
			findings.push({ check: 'allow', path, problem: `malformed allow: ${line.trim()}` });
		} else if (expires < today) {
			findings.push({ check: 'allow', path, problem: `catati-dev-allow(${check}) expired ${expires}` });
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

function readOptional(path) {
	try {
		return readFileSync(path);
	} catch (error) {
		if (error.code === 'ENOENT' || error.code === 'EISDIR') return undefined;
		throw error;
	}
}

export function check(root) {
	const paths = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root })
		.toString()
		.split('\0')
		.filter(Boolean);
	const templates = new Map(Object.values(templateCopies).map((name) => [name, readFileSync(new URL(name, templatesDir))]));
	const wanted = new Set([allowFile, ...checks.flatMap((c) => c.reads), ...paths.filter(isMisnamedEnvTemplate)]);
	const files = new Map([...wanted].map((path) => [path, readOptional(join(root, path))]));
	const today = new Date().toISOString().slice(0, 10);
	const findings = evaluate({ files, paths, templates, today });
	for (const { check, path, problem } of findings) console.log(`${check}: ${path}: ${problem}`);
	return findings.length > 0 ? 1 : 0;
}
