import { RepoError, git, repoRoot } from './repo.mjs';
const doorGlobs = [
	'.github/**',
	'.claude/settings.json',
	'.githooks/**',
	'.claude/hooks/**',
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
	'bin/catati-dev.mjs',
	'lib/check-merge.mjs',
	'lib/repo.mjs',
	'templates/pr-format.yml',
	'templates/claude-settings.json',
	'templates/githooks/**',
	'templates/CODEOWNERS',
	'templates/pull_request_template.md',
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
const rawEntry = /^:(\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ [ACDMTUX]$/;
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

function doorFindings(cwd, baseRev, headRev) {
	const root = repoRoot(cwd);
	const base = commit(root, baseRev);
	const head = commit(root, headRev);
	const from = git(['merge-base', base, head], root, `check-merge: ${baseRev} and ${headRev} share no history`, neutralGit).trim();
	const diff = ['diff', '--raw', '-z', '--no-renames', '--no-abbrev', '--no-relative', '--ignore-submodules=none', from, head];
	const fields = git(diff, root, `git diff failed in ${root}`, neutralGit).split('\0');
	if (fields.length % 2 !== 1 || fields.at(-1) !== '') throw new RepoError(`check-merge: cannot read git diff in ${root}`);
	const found = [];
	for (let index = 0; index < fields.length - 1; index += 2) {
		const modes = fields[index].match(rawEntry);
		const path = fields[index + 1];
		if (!modes || !path) throw new RepoError(`check-merge: cannot read git diff in ${root}`);
		const kind = linkKinds[modes[2]] ?? linkKinds[modes[1]];
		if (kind) found.push(`${escapePath(path)} (${kind})`);
		else if (path.match(unsafeCharacter) || matchesDoorGlob(path)) found.push(escapePath(path));
	}
	return found;
}

export function checkMerge(cwd, args = []) {
	if (args.length !== 2) {
		console.error('usage: catati-dev check-merge <base> <head>');
		return 2;
	}
	let found;
	try {
		found = doorFindings(cwd, ...args);
	} catch (error) {
		if (!(error instanceof RepoError)) throw error;
		console.error(`catati-dev: ${error.message}`);
		return 2;
	}
	for (const path of found) console.log(`one-way-door: ${path}`);
	if (found.length === 0) console.log('check-merge: no one-way-door path');
	return found.length > 0 ? 1 : 0;
}
