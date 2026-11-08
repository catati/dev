import { ruleTargets } from './check.mjs';
import { RepoError, git, repoRoot } from './repo.mjs';

const doorPaths = [
	{ glob: '.github/workflows/**' },
	{ glob: '.github/rulesets/**' },
	{ glob: '.claude/settings.json' },
	{ glob: '.githooks/**' },
	{ glob: 'env/setup.sh' },
	{ glob: '**/wrangler.toml' },
	{ glob: '**/wrangler.json' },
	{ glob: '**/wrangler.jsonc' },
	{ glob: 'firebase.json' },
	{ glob: 'firestore.rules' },
	{ glob: 'storage.rules' },
	{ glob: '**/migrations/**' },
	{ glob: '**/Makefile', when: changesDeployTarget },
	// catati/dev only: setup copies the templates into door paths of every repo, and the gate must not pass a change to its own code.
	{ glob: 'lib/check-merge.mjs' },
	{ glob: 'templates/pr-format.yml' },
	{ glob: 'templates/claude-settings.json' },
	{ glob: 'templates/githooks/**' },
];

function globPattern(glob) {
	const source = glob
		.split(/(\*\*\/|\/\*\*|\*)/)
		.map((part) => ({ '**/': '(?:.*/)?', '/**': '/.*', '*': '[^/]*' })[part] ?? part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
		.join('');
	return new RegExp(`^${source}$`);
}

const doors = doorPaths.map(({ glob, when }) => ({ pattern: globPattern(glob), when: when ?? (() => true) }));

function deployRules(makefile) {
	const kept = [];
	let inDeploy = false;
	for (const line of makefile.split('\n')) {
		const targets = ruleTargets(line);
		if (targets.length > 0) inDeploy = targets.some((name) => name.startsWith('deploy-'));
		else if (!line.startsWith('\t') && line.trim() !== '') inDeploy = false;
		if (inDeploy && line.trim() !== '') kept.push(line);
	}
	return kept.join('\n');
}

function changesDeployTarget(read) {
	return deployRules(read('before')) !== deployRules(read('after'));
}

function blob(root, rev, path) {
	try {
		return git(['show', `${rev}:${path}`], root, '');
	} catch {
		return '';
	}
}

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
	const revs = { before: from, after: head };
	return paths.filter((path) => doors.some(({ pattern, when }) => pattern.test(path) && when((side) => blob(root, revs[side], path))));
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
