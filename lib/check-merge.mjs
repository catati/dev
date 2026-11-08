import { RepoError, git, repoRoot } from './repo.mjs';
const doorGlobs = [
	'.github/**',
	'.claude/settings.json',
	'.githooks/**',
	'env/setup.sh',
	'**/package.json',
	'**/Makefile',
	'**/makefile',
	'**/GNUmakefile',
	'**/*.mk',
	'**/Dockerfile',
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
		.map((part) => ({ '**/': '(?:.*/)?', '/**': '/.*', '*': '[^/]*' })[part] ?? part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
		.join('');
	return new RegExp(`^${source}$`);
}

const doors = doorGlobs.map(globPattern);

function commit(root, rev) {
	if (rev.startsWith('-')) throw new RepoError(`check-merge: ${rev} is not a commit`);
	return git(['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], root, `check-merge: ${rev} is not a commit`).trim();
}

function doorFindings(cwd, baseRev, headRev) {
	const root = repoRoot(cwd);
	const base = commit(root, baseRev);
	const head = commit(root, headRev);
	const from = git(['merge-base', base, head], root, `check-merge: ${baseRev} and ${headRev} share no history`).trim();
	const paths = git(['diff', '--name-only', '--no-renames', '-z', from, head], root, `git diff failed in ${root}`)
		.split('\0')
		.filter(Boolean);
	return paths.filter((path) => doors.some((pattern) => pattern.test(path)));
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
