import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { matchesDoorGlob } from '../lib/check-merge.mjs';

const packageRoot = new URL('../', import.meta.url).pathname;
const cli = join(packageRoot, 'bin/catati-dev.mjs');

function repo(t) {
	const parent = mkdtempSync(join(tmpdir(), 'catati-dev-'));
	t.after(() => rmSync(parent, { recursive: true, force: true }));
	const root = join(parent, 'repo');
	mkdirSync(root);
	const env = { ...process.env, GIT_CEILING_DIRECTORIES: parent, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
	const git = (...args) => execFileSync('git', args, { cwd: root, env, stdio: 'pipe' }).toString().trim();
	git('init', '-q', '-b', 'main');
	const commit = (files = {}, { remove = [], rename = {} } = {}) => {
		for (const [path, content] of Object.entries(files)) {
			mkdirSync(dirname(join(root, path)), { recursive: true });
			writeFileSync(join(root, path), content);
		}
		for (const path of remove) git('rm', '-q', path);
		for (const [from, to] of Object.entries(rename)) {
			mkdirSync(dirname(join(root, to)), { recursive: true });
			git('mv', from, to);
		}
		git('add', '-A');
		git('commit', '-q', '--allow-empty', '-m', 'change');
		return git('rev-parse', 'HEAD');
	};
	const link = (path, target) => {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		symlinkSync(target, join(root, path));
		git('add', '-A');
		git('commit', '-q', '-m', 'link');
		return git('rev-parse', 'HEAD');
	};
	const gitlink = (path) => {
		git('update-index', '--add', '--cacheinfo', `160000,${git('rev-parse', 'HEAD')},${path}`);
		git('commit', '-q', '-m', 'gitlink');
		return git('rev-parse', 'HEAD');
	};
	const run = (args, cwd = root) => {
		const { status, stdout, stderr } = spawnSync(process.execPath, [cli, 'check-merge', ...args], { cwd, encoding: 'utf8', env });
		const lines = stdout.split('\n').filter(Boolean);
		const errors = stderr.split('\n').filter(Boolean);
		return errors.length > 0 ? { status, lines, errors } : { status, lines };
	};
	return { root, parent, git, commit, link, gitlink, run };
}

const clean = { status: 0, lines: ['check-merge: no one-way-door path'] };

test('a diff that touches no door path passes', (t) => {
	const { commit, run } = repo(t);
	const base = commit({ 'README.md': 'a\n', 'lib/x.mjs': '1\n' });
	const head = commit({ 'README.md': 'b\n', 'lib/x.mjs': '2\n', 'lib/check.mjs': 'x\n', 'templates/issue.yml': 'x\n', 'env/.env.example': 'A=\n', 'docs/docker.md': 'x\n' });
	assert.deepEqual(run([base, head]), clean);
});

const doorExamples = [
	'.github/workflows/ci.yml',
	'.github/rulesets/main.json',
	'.github/CODEOWNERS',
	'.github/actions/setup/action.yml',
	'.github/dependabot.yml',
	'.claude/settings.json',
	'.githooks/pre-push',
	'.claude/hooks/git-hooks.sh',
	'.gitmodules',
	'.npmrc',
	'web/.npmrc',
	'env/setup.sh',
	'package.json',
	'web/package.json',
	'Makefile',
	'web/Makefile',
	'web/makefile',
	'GNUmakefile',
	'make/deploy.mk',
	'Dockerfile',
	'mcps/shopify/Dockerfile',
	'dockerfile',
	'Dockerfile.dev',
	'sub/Dockerfile.prod',
	'prod.Dockerfile',
	'app.dockerfile',
	'Containerfile',
	'mcps/gmail/Containerfile.prod',
	'api.containerfile',
	'compose.yml',
	'compose.yaml',
	'compose.prod.yml',
	'deploy/compose.yaml',
	'docker-compose.yml',
	'deploy/docker-compose.prod.yaml',
	'Docker-Compose.yml',
	'wrangler.toml',
	'web/wrangler.json',
	'apps/api/wrangler.jsonc',
	'shopify.app.toml',
	'apps/admin/shopify.app.prod.toml',
	'firebase.json',
	'.firebaserc',
	'firestore.rules',
	'firestore.indexes.json',
	'storage.rules',
	'migrations/0001_init.sql',
	'functions/db/migrations/0002.sql',
	'templates/pr-format.yml',
	'templates/claude-settings.json',
	'templates/githooks/pre-push',
	'templates/CODEOWNERS',
	'templates/pull_request_template.md',
	'bin/catati-dev.mjs',
	'lib/check-merge.mjs',
	'lib/repo.mjs',
];

for (const path of doorExamples) {
	test(`a diff that adds ${path} is a one-way door`, (t) => {
		const { commit, run } = repo(t);
		const base = commit({ 'README.md': 'a\n' });
		const head = commit({ [path]: 'x\n', 'README.md': 'b\n' });
		assert.deepEqual(run([base, head]), { status: 1, lines: [`one-way-door: ${path}`] });
	});
}

test('nested look-alikes of root-only door paths are not doors', (t) => {
	const { commit, run } = repo(t);
	const base = commit({ 'README.md': 'a\n' });
	const head = commit({
		'docs/firebase.json': 'x\n',
		'web/.firebaserc': 'x\n',
		'pkg/.github/workflows/ci.yml': 'x\n',
		'pkg/env/setup.sh': 'x\n',
		'migrations.md': 'x\n',
		'docs/compose.md': 'x\n',
		'docs/dockerfiles.md': 'x\n',
		'.github.md': 'x\n',
		'package-lock.json': 'x\n',
		'pnpm-lock.yaml': 'x\n',
	});
	assert.deepEqual(run([base, head]), clean);
});

const literalImport = /^\s*(?:(['"])([^'"]+)\1|new URL\(\s*(['"])([^'"]+)\3\s*,\s*import\.meta\.url\s*\))\s*\)/;
const staticImport = /^\s*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;

function staticImports(source) {
	return [...source.matchAll(staticImport)].map((match) => match[1] ?? match[2]);
}

function dynamicImports(source, path) {
	return [...source.matchAll(/\bimport\s*\(/g)].map((match) => {
		const literal = source.slice(match.index + match[0].length).match(literalImport);
		if (!literal) throw new Error(`${path} has a dynamic import whose target is not a literal`);
		return literal[2] ?? literal[4];
	});
}

function commandEntry(source, name) {
	const key = source.match(new RegExp(`^\\s*'${name}':`, 'm'));
	assert.ok(key, `bin/catati-dev.mjs has no ${name} entry`);
	const rest = source.slice(key.index + key[0].length);
	return rest.slice(0, rest.search(/\n\s*(?:'[^']+'|\w+):|\n\};/));
}

function gateClosure(read = (file) => readFileSync(file, 'utf8')) {
	const seen = new Set();
	const visit = (file, specs) => {
		const path = relative(packageRoot, file);
		if (seen.has(path)) return;
		seen.add(path);
		const source = read(file);
		for (const spec of specs ?? [...staticImports(source), ...dynamicImports(source, path)]) if (spec.startsWith('.')) visit(join(dirname(file), spec));
	};
	const bin = read(cli);
	dynamicImports(bin, 'bin/catati-dev.mjs');
	visit(cli, [...staticImports(bin), ...dynamicImports(commandEntry(bin, 'check-merge'), 'bin/catati-dev.mjs')]);
	return [...seen, 'package.json'].sort();
}

test('the closure follows the check-merge entry and refuses an import it cannot follow', () => {
	const bin = readFileSync(cli, 'utf8');
	const withBin = (text) => (file) => (file === cli ? text : readFileSync(file, 'utf8'));
	const edit = (from, to) => {
		assert.ok(bin.includes(from));
		return withBin(bin.replace(from, to));
	};
	assert.ok(gateClosure(edit("'check-merge': async () => (", "'check-merge': async () => (await import('../lib/setup.mjs'), ")).includes('lib/setup.mjs'));
	assert.ok(gateClosure(edit("import('../lib/check-merge.mjs')", "import(new URL('../lib/check.mjs', import.meta.url))")).includes('lib/check.mjs'));
	assert.throws(() => gateClosure(edit("import('../lib/check-merge.mjs')", "import(`../lib/${'check-merge'}.mjs`)")), /not a literal/);
	assert.throws(() => gateClosure(withBin(`${bin}\nconst x = '../lib/setup.mjs';\nawait import(x);\n`)), /not a literal/);
});

test('every file the check-merge command loads, and package.json, is a one-way door', (t) => {
	const closure = gateClosure();
	assert.deepEqual(closure, ['bin/catati-dev.mjs', 'lib/check-merge.mjs', 'lib/repo.mjs', 'package.json']);
	const { commit, run } = repo(t);
	const base = commit({ 'README.md': 'a\n' });
	const head = commit(Object.fromEntries(closure.map((path) => [path, 'x\n'])));
	assert.deepEqual(run([base, head]), { status: 1, lines: closure.map((path) => `one-way-door: ${path}`) });
});

const newlinePaths = [
	'a\nb/Makefile',
	'a\nb/package.json',
	'p\nq/migrations/1.sql',
	'.github/workflows/x\ny.yml',
	'.github/workflows/ci\r.yml',
	'a\rb/Makefile',
	'a\u2028b/Makefile',
	'a\u2029b/Makefile',
];

test('a door glob matches a path that holds a newline, a CR or a line separator', () => {
	for (const path of newlinePaths) assert.ok(matchesDoorGlob(path), JSON.stringify(path));
	assert.ok(!matchesDoorGlob('docs/a\nb.md'));
});

test('a path with a control character or line separator is itself a one-way door, printed escaped', (t) => {
	const { commit, run } = repo(t);
	const escaped = [
		'a\\u000ab/Makefile',
		'a\\u000ab/package.json',
		'p\\u000aq/migrations/1.sql',
		'.github/workflows/x\\u000ay.yml',
		'.github/workflows/ci\\u000d.yml',
		'a\\u000db/Makefile',
		'a\\u2028b/Makefile',
		'a\\u2029b/Makefile',
	];
	for (const [index, path] of newlinePaths.entries()) {
		const base = commit({ 'README.md': `${index}\n` });
		const head = commit({ [path]: 'x\n' });
		assert.deepEqual(run([base, head]), { status: 1, lines: [`one-way-door: ${escaped[index]}`] }, JSON.stringify(path));
	}
	const base = commit({ 'README.md': 'end\n' });
	const head = commit({ 'docs/a\tb.md': 'x\n', 'docs/c\u007fd.md': 'x\n', 'docs/e\u0001f.md': 'x\n' });
	assert.deepEqual(run([base, head]), {
		status: 1,
		lines: ['one-way-door: docs/a\\u0009b.md', 'one-way-door: docs/c\\u007fd.md', 'one-way-door: docs/e\\u0001f.md'],
	});
});

for (const dir of ['.githooks', '.github', '.claude/hooks', 'migrations', 'functions/migrations']) {
	test(`a symlink or gitlink at the bare ${dir} path is a one-way door`, (t) => {
		const { commit, link, gitlink, run } = repo(t);
		const base = commit({ 'README.md': 'a\n', 'hooks/pre-push': 'exit 0\n' });
		const linked = link(dir, '../hooks');
		assert.deepEqual(run([base, linked]), { status: 1, lines: [`one-way-door: ${dir}`] });
		const unlinked = commit({}, { remove: [dir] });
		assert.deepEqual(run([base, unlinked]), clean);
		assert.deepEqual(run([unlinked, gitlink(dir)]), { status: 1, lines: [`one-way-door: ${dir}`] });
	});
}

test('an unknown or inherited command name prints usage and exits with 2', () => {
	for (const name of ['constructor', '__proto__', 'toString', 'nope']) {
		const { status, stderr } = spawnSync(process.execPath, [cli, name], { encoding: 'utf8' });
		assert.equal(status, 2, name);
		assert.match(stderr, /^usage: catati-dev </, name);
	}
});

test('a rename into or out of a door path is a one-way door', (t) => {
	const { commit, run } = repo(t);
	const base = commit({ 'docs/ci.yml': 'on: push\n' });
	const into = commit({}, { rename: { 'docs/ci.yml': '.github/workflows/ci.yml' } });
	assert.deepEqual(run([base, into]), { status: 1, lines: ['one-way-door: .github/workflows/ci.yml'] });
	const out = commit({}, { rename: { '.github/workflows/ci.yml': 'docs/ci.yml' } });
	assert.deepEqual(run([into, out]), { status: 1, lines: ['one-way-door: .github/workflows/ci.yml'] });
});

test('only the head side of the merge base counts, as in base...head', (t) => {
	const { commit, git, run } = repo(t);
	commit({ 'README.md': 'a\n' });
	git('checkout', '-q', '-b', 'feature');
	commit({ 'README.md': 'b\n' });
	git('checkout', '-q', 'main');
	commit({ '.github/workflows/ci.yml': 'on: push\n' });
	assert.deepEqual(run(['main', 'feature']), clean);
	assert.deepEqual(run(['feature', 'main']), { status: 1, lines: ['one-way-door: .github/workflows/ci.yml'] });
});

test('a bad argument or a run outside a git repo prints one line and exits with 2', (t) => {
	const { commit, parent, run } = repo(t);
	const head = commit({ 'README.md': 'a\n' });
	const usage = { status: 2, lines: [], errors: ['usage: catati-dev check-merge <base> <head>'] };
	assert.deepEqual(run([]), usage);
	assert.deepEqual(run([head]), usage);
	assert.deepEqual(run([head, head, head]), usage);
	assert.deepEqual(run(['nope', head]), { status: 2, lines: [], errors: ['catati-dev: check-merge: nope is not a commit'] });
	assert.deepEqual(run(['--output=x', head]), { status: 2, lines: [], errors: ['catati-dev: check-merge: --output=x is not a commit'] });
	assert.deepEqual(run(['a', 'b'], parent), { status: 2, lines: [], errors: ['catati-dev: not inside a git repository'] });
});
