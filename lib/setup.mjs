import { chmodSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { printFindings, repoFindings } from './check.mjs';
import { RepoError, repoRoot } from './repo.mjs';

export const managedFiles = [
	{ path: '.github/ISSUE_TEMPLATE/issue.yml', source: 'issue.yml', mode: 'copy' },
	{ path: '.github/pull_request_template.md', source: 'pull_request_template.md', mode: 'copy' },
	{ path: '.github/CODEOWNERS', source: 'CODEOWNERS', mode: 'copy' },
	{ path: '.githooks/pre-commit', source: 'githooks/pre-commit', mode: 'copy', executable: true },
	{ path: '.githooks/pre-push', source: 'githooks/pre-push', mode: 'copy', executable: true },
	{ path: '.node-version', source: 'node-version', mode: 'copy' },
	{ path: '.claude/settings.json', source: 'claude-settings.json', mode: 'merge-json' },
];

class Skip extends Error {}

const desiredBytes = {
	copy: (current, source) => source,
	'merge-json': (current, source) => mergeJsonFile(current, JSON.parse(source)),
};

function mergeJsonFile(current, template) {
	if (current === undefined) return serialize(template, '  ', true);
	const text = current.toString();
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Skip('is not valid JSON; left as is');
	}
	const indent = text.match(/^[ \t]+/m)?.[0] ?? '  ';
	const newline = text.endsWith('\n');
	if (!serialize(value, indent, newline).equals(current)) throw new Skip('has formatting a rewrite would change; left as is');
	return serialize(mergeJson(value, template, ''), indent, newline);
}

function serialize(value, indent, newline) {
	return Buffer.from(JSON.stringify(value, null, indent) + (newline ? '\n' : ''));
}

function mergeJson(value, template, at) {
	if (value === undefined) return template;
	const where = at || 'the top level';
	if (Array.isArray(template)) {
		if (!Array.isArray(value)) throw new Skip(`${where} is not a list; left as is`);
		const present = new Set(value.map((item) => JSON.stringify(item)));
		return [...value, ...template.filter((item) => !present.has(JSON.stringify(item)))];
	}
	if (isObject(template)) {
		if (!isObject(value)) throw new Skip(`${where} is not an object; left as is`);
		const merged = { ...value };
		for (const [key, item] of Object.entries(template)) {
			merged[key] = mergeJson(Object.hasOwn(value, key) ? value[key] : undefined, item, at ? `${at}.${key}` : key);
		}
		return merged;
	}
	if (JSON.stringify(value) !== JSON.stringify(template)) throw new Skip(`${where} is ${JSON.stringify(value)}; left as is`);
	return value;
}

function isObject(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fsCall(path, action) {
	try {
		return action();
	} catch (error) {
		throw new RepoError(`cannot write ${path}: ${error.code ?? error.message}`);
	}
}

function plan(root, entry) {
	const full = join(root, entry.path);
	let stat;
	try {
		stat = lstatSync(full);
	} catch (error) {
		if (error.code !== 'ENOENT') throw new RepoError(`cannot read ${entry.path}: ${error.code ?? error.message}`);
	}
	if (stat && !stat.isFile()) return { entry, skip: 'is not a regular file; left as is' };
	let current;
	try {
		current = stat && readFileSync(full);
	} catch (error) {
		throw new RepoError(`cannot read ${entry.path}: ${error.code ?? error.message}`);
	}
	const source = readFileSync(new URL(`../templates/${entry.source}`, import.meta.url));
	let bytes;
	try {
		bytes = desiredBytes[entry.mode](current, source);
	} catch (error) {
		if (error instanceof Skip) return { entry, skip: error.message };
		throw error;
	}
	if (!stat) return { entry, action: 'created', bytes };
	const fileMode = stat.mode & 0o7777;
	const mode = entry.executable ? fileMode | 0o111 : fileMode;
	const action = bytes.equals(current) && mode === fileMode ? 'unchanged' : 'updated';
	return { entry, action, bytes, mode };
}

function apply(root, { entry, action, bytes, mode }) {
	const full = join(root, entry.path);
	const staged = `${full}.catati-dev.tmp`;
	fsCall(entry.path, () => rmSync(staged, { force: true }));
	if (action === 'unchanged') return;
	fsCall(entry.path, () => {
		mkdirSync(dirname(full), { recursive: true });
		try {
			writeFileSync(staged, bytes, { mode: entry.executable ? 0o777 : 0o666 });
			if (mode !== undefined) chmodSync(staged, mode);
			renameSync(staged, full);
		} finally {
			rmSync(staged, { force: true });
		}
	});
}

export function setup(cwd, args = []) {
	const unknown = args.find((arg) => arg !== '--dry-run');
	if (unknown !== undefined) {
		console.error(`catati-dev: setup takes only --dry-run, not ${unknown}`);
		return 2;
	}
	const dryRun = args.includes('--dry-run');
	try {
		const root = repoRoot(cwd);
		const plans = managedFiles.map((entry) => plan(root, entry));
		for (const planned of plans) {
			if (planned.skip) {
				console.log(`skipped ${planned.entry.path}: ${planned.skip}`);
				continue;
			}
			if (!dryRun) apply(root, planned);
			console.log(`${planned.action} ${planned.entry.path}`);
		}
		printFindings(repoFindings(root, new Map(plans.filter((p) => p.bytes).map((p) => [p.entry.path, p.bytes]))));
	} catch (error) {
		if (!(error instanceof RepoError)) throw error;
		console.error(`catati-dev: ${error.message}`);
		return 2;
	}
	return 0;
}
