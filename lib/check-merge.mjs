import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { RepoError, git, repoRoot } from './repo.mjs';

const catatiDevUrl = 'https://github.com/catati/dev.git';
const pinValue = /^git\+https:\/\/github\.com\/catati\/dev\.git#([0-9a-f]{40})$/;
const pinSections = ['dependencies', 'devDependencies'];

const doorGlobs = [
	'.github/**',
	'.claude/settings.json',
	'.githooks/**',
	'.claude/hooks/**',
	'plugins/*/hooks/**',
	'.gitmodules',
	'**/.npmrc',
	'env/setup.sh',
	'**/package.json',
	'**/Makefile',
	'**/GNUmakefile',
	'**/*.mk',
	'**/Dockerfile',
	'**/Dockerfile.*',
	'**/*.Dockerfile',
	'**/Containerfile',
	'**/Containerfile.*',
	'**/*.Containerfile',
	'**/compose*.yml',
	'**/compose*.yaml',
	'**/docker-compose*',
	'**/wrangler.toml',
	'**/wrangler.json',
	'**/wrangler.jsonc',
	'**/shopify.app*.toml',
	'firebase.json',
	'.firebaserc',
	'firestore.rules',
	'firestore.indexes.json',
	'storage.rules',
	'**/migrations/**',
	// catati/dev only: setup copies the templates into door paths of every repo, and the gate must not pass a change to its own code.
	'bin/catati.mjs',
	'lib/check-merge.mjs',
	'lib/repo.mjs',
	'templates/githooks/**',
];

function globPattern(glob) {
	const source = glob
		.split(/(\*\*\/|\/\*\*|\*)/)
		.map((part) => ({ '**/': '(?:[^]*/)?', '/**': '(?:/[^]*)?', '*': '[^/]*' })[part] ?? part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
		.join('');
	return new RegExp(`^${source}$`, 'i');
}

const doors = doorGlobs.map(globPattern);
const linkKinds = { 120000: 'symlink', 160000: 'submodule' };
const rawEntry = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([ACDMTUX])$/;
const unsafeCharacter = /[\u0000-\u001f\u007f\u2028\u2029]/g;

export function matchesDoorGlob(path) {
	return doors.some((pattern) => pattern.test(path));
}

function escapePath(path) {
	return path.replace(unsafeCharacter, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

const injectedConfig = /^GIT_CONFIG_(?:PARAMETERS|COUNT|KEY_\d+|VALUE_\d+)$/;
const neutralGit = {
	maxBuffer: 256 * 1024 * 1024,
	env: {
		...Object.fromEntries(Object.entries(process.env).filter(([name]) => !injectedConfig.test(name))),
		GIT_CONFIG_NOSYSTEM: '1',
		GIT_CONFIG_GLOBAL: '/dev/null',
		GIT_NO_REPLACE_OBJECTS: '1',
		GIT_GRAFT_FILE: '/dev/null',
	},
};

function commit(root, rev) {
	if (rev.startsWith('-')) throw new RepoError(`check-merge: ${rev} is not a commit`);
	return git(['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], root, `check-merge: ${rev} is not a commit`, neutralGit).trim();
}

const fetchGit = { ...neutralGit, timeout: 120_000, env: { ...neutralGit.env, GIT_TERMINAL_PROMPT: '0' } };
const stringOrSpace = /"(?:[^"\\]|\\.)*"|\s+/g;

function exactObject(text) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		return undefined;
	}
	// A duplicate key, an escaped key or an integer-like key that JSON.parse reorders lets another reader see a different file.
	const bare = text.replace(stringOrSpace, (token) => (token.startsWith('"') ? token : ''));
	const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
	return isObject && bare === JSON.stringify(value) ? value : undefined;
}

function routinePins(before, after) {
	const from = exactObject(before);
	const to = exactObject(after);
	if (!from || !to) return undefined;
	const pins = [];
	for (const section of pinSections) {
		const old = from[section]?.['@catati/dev'];
		const next = to[section]?.['@catati/dev'];
		if (old === next) continue;
		const sha = typeof old === 'string' && typeof next === 'string' && next.match(pinValue)?.[1];
		if (!sha) return undefined;
		pins.push(sha);
		delete from[section]['@catati/dev'];
		delete to[section]['@catati/dev'];
	}
	delete from.version;
	delete to.version;
	return JSON.stringify(from) === JSON.stringify(to) ? pins : undefined;
}

function packagePins(root, [, oldMode, newMode, oldBlob, newBlob, status], path) {
	if (basename(path).toLowerCase() !== 'package.json' || status !== 'M' || oldMode !== newMode) return undefined;
	const blob = (sha) => git(['cat-file', 'blob', sha], root, `check-merge: cannot read ${path}`, neutralGit);
	return routinePins(blob(oldBlob), blob(newBlob));
}

function isOnMain(gitDir, sha) {
	try {
		git([`--git-dir=${gitDir}`, 'merge-base', '--is-ancestor', sha, 'refs/heads/main'], gitDir, 'not on main', fetchGit);
		return true;
	} catch (error) {
		if (error instanceof RepoError) return false;
		throw error;
	}
}

function commitsOnMain(url, shas) {
	if (shas.length === 0) return new Set();
	const dir = mkdtempSync(join(tmpdir(), 'catati-dev-main-'));
	try {
		const clone = ['clone', '--quiet', '--bare', '--filter=tree:0', '--single-branch', '--branch', 'main', '--no-tags', '--', url, dir];
		git(clone, dir, `check-merge: cannot fetch main from ${url}, so a @catati/dev pin move stays a door`, fetchGit);
		return new Set(shas.filter((sha) => isOnMain(dir, sha)));
	} catch (error) {
		if (!(error instanceof RepoError)) throw error;
		console.error(`catati: ${error.message}`);
		return new Set();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function doorFindings(cwd, baseRev, headRev, mainUrl) {
	const root = repoRoot(cwd);
	const base = commit(root, baseRev);
	const head = commit(root, headRev);
	const from = git(['merge-base', base, head], root, `check-merge: ${baseRev} and ${headRev} share no history`, neutralGit).trim();
	const diff = ['diff', '--raw', '-z', '--no-renames', '--no-abbrev', '--no-relative', '--ignore-submodules=none', from, head];
	const fields = git(diff, root, `git diff failed in ${root}`, neutralGit).split('\0');
	if (fields.length % 2 !== 1 || fields.at(-1) !== '') throw new RepoError(`check-merge: cannot read git diff in ${root}`);
	const found = [];
	for (let index = 0; index < fields.length - 1; index += 2) {
		const entry = fields[index].match(rawEntry);
		const path = fields[index + 1];
		if (!entry || !path) throw new RepoError(`check-merge: cannot read git diff in ${root}`);
		const kind = linkKinds[entry[2]] ?? linkKinds[entry[1]];
		if (kind) found.push({ path: `${escapePath(path)} (${kind})` });
		else if (path.match(unsafeCharacter)) found.push({ path: escapePath(path) });
		else if (matchesDoorGlob(path)) found.push({ path, pins: packagePins(root, entry, path) });
	}
	const merged = commitsOnMain(mainUrl, found.flatMap(({ pins }) => pins ?? []));
	return found.filter(({ pins }) => !pins?.every((sha) => merged.has(sha))).map(({ path }) => path);
}

export function checkMerge(cwd, args = [], mainUrl = catatiDevUrl) {
	if (args.length !== 2) {
		console.error('usage: catati check-merge <base> <head>');
		return 2;
	}
	let found;
	try {
		found = doorFindings(cwd, ...args, mainUrl);
	} catch (error) {
		if (!(error instanceof RepoError)) throw error;
		console.error(`catati: ${error.message}`);
		return 2;
	}
	for (const path of found) console.log(`one-way-door: ${path}`);
	if (found.length === 0) console.log('check-merge: no one-way-door path');
	return found.length > 0 ? 1 : 0;
}
