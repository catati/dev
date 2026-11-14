import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { matchesDoorGlob } from '../lib/check-merge.mjs';

const packageRoot = new URL('../', import.meta.url).pathname;
const cli = join(packageRoot, 'bin/catati.mjs');

function repo(t) {
	const parent = mkdtempSync(join(tmpdir(), 'catati-'));
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
	const run = (args, cwd = root, extraEnv = {}) => outcome(spawnSync(process.execPath, [cli, 'check-merge', ...args], { cwd, encoding: 'utf8', env: { ...env, ...extraEnv } }));
	return { root, parent, git, commit, link, gitlink, run };
}

function outcome({ status, stdout, stderr }) {
	const lines = stdout.split('\n').filter(Boolean);
	const errors = stderr.split('\n').filter(Boolean);
	return errors.length > 0 ? { status, lines, errors } : { status, lines };
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
	'plugins/catati/hooks/guard-prod.mjs',
	'plugins/catati/hooks/hooks.json',
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
	'templates/githooks/pre-push',
	'bin/catati.mjs',
	'lib/check-merge.mjs',
	'lib/repo.mjs',
	'MAKEFILE',
	'PACKAGE.JSON',
	'web/Package.Json',
	'.GITHUB/x',
	'.Claude/Settings.json',
	'Firebase.json',
	'Migrations/1.sql',
	'LIB/CHECK-MERGE.MJS',
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
	assert.ok(key, `bin/catati.mjs has no ${name} entry`);
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
	dynamicImports(bin, 'bin/catati.mjs');
	visit(cli, [...staticImports(bin), ...dynamicImports(commandEntry(bin, 'check-merge'), 'bin/catati.mjs')]);
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
	assert.deepEqual(closure, ['bin/catati.mjs', 'lib/check-merge.mjs', 'lib/repo.mjs', 'package.json']);
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
		assert.deepEqual(run([base, linked]), { status: 1, lines: [`one-way-door: ${dir} (symlink)`] });
		const unlinked = commit({}, { remove: [dir] });
		assert.deepEqual(run([base, unlinked]), clean);
		assert.deepEqual(run([linked, unlinked]), { status: 1, lines: [`one-way-door: ${dir} (symlink)`] });
		assert.deepEqual(run([unlinked, gitlink(dir)]), { status: 1, lines: [`one-way-door: ${dir} (submodule)`] });
	});
}

test('any symlink or gitlink that a diff adds, changes or removes is a one-way door', (t) => {
	const { commit, link, gitlink, run } = repo(t);
	const base = commit({ 'README.md': 'a\n', 'sub/Makefile': 'deploy:\n', 'docs/x.md': 'x\n' });
	assert.deepEqual(run([base, link('.claude', 'sub')]), { status: 1, lines: ['one-way-door: .claude (symlink)'] });
	const plain = commit({ 'docs/y.md': 'y\n' });
	const gitlinked = gitlink('env');
	assert.deepEqual(run([plain, gitlinked]), { status: 1, lines: ['one-way-door: env (submodule)'] });
	const aliased = link('other/sub2', '../sub');
	assert.deepEqual(run([gitlinked, aliased]), { status: 1, lines: ['one-way-door: env (submodule)', 'one-way-door: other/sub2 (symlink)'] });
	const deleted = commit({}, { remove: ['other/sub2'] });
	assert.deepEqual(run([aliased, deleted]), { status: 1, lines: ['one-way-door: other/sub2 (symlink)'] });
	commit({}, { remove: ['docs/x.md'] });
	const fileToLink = link('docs/x.md', '../sub/Makefile');
	assert.deepEqual(run([deleted, fileToLink]), { status: 1, lines: ['one-way-door: docs/x.md (symlink)'] });
	commit({}, { remove: ['docs/x.md'] });
	const linkToFile = commit({ 'docs/x.md': 'x\n' });
	assert.deepEqual(run([fileToLink, linkToFile]), { status: 1, lines: ['one-way-door: docs/x.md (symlink)'] });
	assert.deepEqual(run([linkToFile, commit({ 'docs/x.md': 'y\n' })]), clean);
});

test('a door path that is also a symlink prints once', (t) => {
	const { commit, link, run } = repo(t);
	const base = commit({ 'README.md': 'a\n', 'settings.json': '{}\n' });
	assert.deepEqual(run([base, link('.claude/settings.json', '../settings.json')]), { status: 1, lines: ['one-way-door: .claude/settings.json (symlink)'] });
});

test('an unknown or inherited command name prints usage and exits with 2', () => {
	for (const name of ['constructor', '__proto__', 'toString', 'nope']) {
		const { status, stderr } = spawnSync(process.execPath, [cli, name], { encoding: 'utf8' });
		assert.equal(status, 2, name);
		assert.match(stderr, /^usage: catati </, name);
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
	const usage = { status: 2, lines: [], errors: ['usage: catati check-merge <base> <head>'] };
	assert.deepEqual(run([]), usage);
	assert.deepEqual(run([head]), usage);
	assert.deepEqual(run([head, head, head]), usage);
	assert.deepEqual(run(['nope', head]), { status: 2, lines: [], errors: ['catati: check-merge: nope is not a commit'] });
	assert.deepEqual(run(['--output=x', head]), { status: 2, lines: [], errors: ['catati: check-merge: --output=x is not a commit'] });
	assert.deepEqual(run(['a', 'b'], parent), { status: 2, lines: [], errors: ['catati: not inside a git repository'] });
});

function submoduleCases(t, setup, ignore = '') {
	const fixture = repo(t);
	const { commit, gitlink, git, run } = fixture;
	const base = commit({ 'README.md': 'a\n', '.gitmodules': `[submodule "vendor"]\n\tpath = vendor\n\turl = https://example.invalid/vendor.git\n${ignore}` });
	const added = gitlink('vendor');
	commit({ 'README.md': 'b\n' });
	const bumped = gitlink('vendor');
	git('rm', '-q', '--cached', 'vendor');
	git('commit', '-q', '-m', 'drop');
	const deleted = git('rev-parse', 'HEAD');
	const extraEnv = setup(fixture) ?? {};
	const submodule = { status: 1, lines: ['one-way-door: vendor (submodule)'] };
	assert.deepEqual(run([base, added], fixture.root, extraEnv), submodule, 'add');
	assert.deepEqual(run([added, bumped], fixture.root, extraEnv), submodule, 'bump');
	assert.deepEqual(run([bumped, deleted], fixture.root, extraEnv), submodule, 'delete');
}

test('a .gitmodules entry with ignore = all does not hide a submodule add, bump or delete', (t) => {
	submoduleCases(t, () => {}, '\tignore = all\n');
});

test('diff.ignoreSubmodules = all in the repo config does not hide a submodule change', (t) => {
	submoduleCases(t, ({ git }) => {
		git('config', 'diff.ignoreSubmodules', 'all');
		git('config', 'submodule.vendor.ignore', 'all');
	});
});

test('diff.ignoreSubmodules = all in ~/.gitconfig does not hide a submodule change', (t) => {
	submoduleCases(t, ({ parent }) => {
		const home = join(parent, 'home');
		mkdirSync(home);
		writeFileSync(join(home, '.gitconfig'), '[diff]\n\tignoreSubmodules = all\n');
		return { HOME: home, XDG_CONFIG_HOME: join(home, '.config'), GIT_CONFIG_GLOBAL: join(home, '.gitconfig') };
	});
});

test('diff.ignoreSubmodules = all in GIT_CONFIG_PARAMETERS does not hide a submodule change', (t) => {
	submoduleCases(t, () => ({ GIT_CONFIG_PARAMETERS: "'diff.ignoreSubmodules'='all'" }));
});

test('diff.ignoreSubmodules = all in GIT_CONFIG_COUNT entries does not hide a submodule change', (t) => {
	submoduleCases(t, () => ({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'diff.ignoreSubmodules', GIT_CONFIG_VALUE_0: 'all' }));
});

test('a replace ref or a graft does not hide the head tree', (t) => {
	const { root, commit, git, run } = repo(t);
	const base = commit({ 'README.md': 'a\n' });
	const head = commit({ '.github/workflows/ci.yml': 'on: push\n' });
	const door = { status: 1, lines: ['one-way-door: .github/workflows/ci.yml'] };
	git('replace', head, base);
	git('config', 'core.useReplaceRefs', 'true');
	assert.deepEqual(run([base, head]), door);
	git('replace', '-d', head);
	writeFileSync(join(root, '.git/info/grafts'), `${base} ${head}\n`);
	assert.deepEqual(run([base, head]), door);
});

test('a diff of thousands of long paths is read whole', (t) => {
	const { commit, run } = repo(t);
	const base = commit({ 'README.md': 'a\n' });
	const dir = `docs/${'d'.repeat(200)}`;
	const plain = commit(Object.fromEntries(Array.from({ length: 4000 }, (_, index) => [`${dir}/${index}-${'f'.repeat(100)}.md`, 'x\n'])));
	assert.deepEqual(run([base, plain]), clean);
	assert.deepEqual(run([base, commit({ Makefile: 'x\n' })]), { status: 1, lines: ['one-way-door: Makefile'] });
});

const packageJson = (fields, indent = '\t') => `${JSON.stringify({ name: 'app', private: true, ...fields }, null, indent)}\n`;
const scripts = { deploy: 'wrangler deploy' };
const pin = (sha) => `git+https://github.com/catati/dev.git#${sha}`;
const packageDoor = { status: 1, lines: ['one-way-door: package.json'] };

test('a package.json diff that changes only the top-level version is not a door', (t) => {
	const { commit, run } = repo(t);
	const base = commit({ 'package.json': packageJson({ version: '1.2.0', scripts }), 'web/Package.Json': packageJson({ scripts }) });
	const head = commit({ 'package.json': packageJson({ version: '1.3.0', scripts }, 2), 'web/Package.Json': packageJson({ version: '0.1.0', scripts }) });
	assert.deepEqual(run([base, head]), clean);
	assert.deepEqual(run([head, commit({ 'package.json': packageJson({ scripts }) })]), clean);
});

test('a package.json diff that changes the version and anything else is a door', async (t) => {
	const cases = {
		scripts: [{ version: '1.0.0', scripts }, { version: '1.0.1', scripts: { deploy: 'wrangler deploy --env prod' } }],
		'a nested version': [{ version: '1.0.0', config: { version: 'a' } }, { version: '1.0.0', config: { version: 'b' } }],
		'key order': [{ version: '1.0.0', bin: 'a', main: 'b' }, { version: '1.0.1', main: 'b', bin: 'a' }],
		'another dependency': [{ version: '1.0.0', dependencies: { hono: '4.0.0' } }, { version: '1.0.1', dependencies: { hono: '4.0.1' } }],
	};
	for (const [name, [before, after]] of Object.entries(cases)) {
		await t.test(name, (t) => {
			const { commit, run } = repo(t);
			const base = commit({ 'package.json': packageJson(before) });
			assert.deepEqual(run([base, commit({ 'package.json': packageJson(after) })]), packageDoor);
		});
	}
});

test('a package.json that JSON.parse cannot read exactly, or that is not an object, stays a door', async (t) => {
	const cases = {
		unparsable: ['{"version": "1.0.0", scripts}\n', '{"version": "1.0.1", scripts}\n'],
		'unparsable before': ['x\n', packageJson({ version: '1.0.1' })],
		'a duplicate key': ['{"version":"1.0.0","scripts":{"a":"x"},"scripts":{"a":"x"}}\n', '{"version":"1.0.1","scripts":{"a":"y"},"scripts":{"a":"x"}}\n'],
		'an escaped key': ['{"version":"1.0.0","scripts":{}}\n', '{"version":"1.0.1","scr\\u0069pts":{}}\n'],
		'a byte order mark': [`﻿${packageJson({ version: '1.0.0' })}`, `﻿${packageJson({ version: '1.0.1' })}`],
		'not an object': ['["1.0.0"]\n', '["1.0.1"]\n'],
	};
	for (const [name, [before, after]] of Object.entries(cases)) {
		await t.test(name, (t) => {
			const { commit, run } = repo(t);
			const base = commit({ 'package.json': before });
			assert.deepEqual(run([base, commit({ 'package.json': after })]), packageDoor);
		});
	}
});

test('a package.json that is added, deleted or made executable stays a door', (t) => {
	const { commit, git, run } = repo(t);
	const base = commit({ 'README.md': 'a\n' });
	const added = commit({ 'package.json': packageJson({ version: '1.0.0' }) });
	assert.deepEqual(run([base, added]), packageDoor);
	const deleted = commit({}, { remove: ['package.json'] });
	assert.deepEqual(run([added, deleted]), packageDoor);
	const again = commit({ 'package.json': packageJson({ version: '1.0.0' }) });
	git('update-index', '--chmod=+x', 'package.json');
	git('commit', '-q', '-m', 'exec');
	assert.deepEqual(run([again, git('rev-parse', 'HEAD')]), packageDoor);
});

function upstream(t) {
	const { root, commit, git } = repo(t);
	const old = commit({ 'README.md': 'old\n' });
	const head = commit({ 'README.md': 'head\n' });
	git('checkout', '-q', '-b', 'side');
	const side = commit({ 'README.md': 'side\n' });
	git('checkout', '-q', 'main');
	return { url: pathToFileURL(root).href, old, head, side };
}

const driver = `import { checkMerge } from ${JSON.stringify(pathToFileURL(join(packageRoot, 'lib/check-merge.mjs')).href)};
process.exitCode = checkMerge(process.cwd(), JSON.parse(process.argv[1]), process.argv[2]);`;

function runAgainst(fixture, url, args) {
	return outcome(spawnSync(process.execPath, ['--input-type=module', '-e', driver, JSON.stringify(args), url], { cwd: fixture.root, encoding: 'utf8' }));
}

test('a package.json diff that only moves the @catati/dev pin to a commit on catati/dev main is not a door', async (t) => {
	const dev = upstream(t);
	for (const section of ['dependencies', 'devDependencies']) {
		await t.test(section, (t) => {
			const fixture = repo(t);
			const { commit } = fixture;
			const base = commit({ 'package.json': packageJson({ version: '1.0.0', [section]: { '@catati/dev': pin(dev.old), hono: '4.0.0' } }), 'pnpm-lock.yaml': 'old\n' });
			const moved = commit({ 'package.json': packageJson({ version: '1.0.0', [section]: { '@catati/dev': pin(dev.head), hono: '4.0.0' } }), 'pnpm-lock.yaml': 'new\n' });
			assert.deepEqual(runAgainst(fixture, dev.url, [base, moved]), clean);
			const bumped = commit({ 'package.json': packageJson({ version: '1.1.0', [section]: { '@catati/dev': pin(dev.old), hono: '4.0.0' } }) });
			assert.deepEqual(runAgainst(fixture, dev.url, [moved, bumped]), clean);
		});
	}
	await t.test('from another pin form', (t) => {
		const fixture = repo(t);
		const base = fixture.commit({ 'package.json': packageJson({ devDependencies: { '@catati/dev': 'github:catati/dev#main' } }) });
		const moved = fixture.commit({ 'package.json': packageJson({ devDependencies: { '@catati/dev': pin(dev.head) } }) });
		assert.deepEqual(runAgainst(fixture, dev.url, [base, moved]), clean);
	});
});

test('a @catati/dev pin move that catati/dev main does not confirm is a door', async (t) => {
	const dev = upstream(t);
	const before = { version: '1.0.0', devDependencies: { '@catati/dev': pin(dev.old) } };
	const cases = {
		'a commit off main': { devDependencies: { '@catati/dev': pin(dev.side) } },
		'an unknown commit': { devDependencies: { '@catati/dev': pin('0123456789abcdef0123456789abcdef01234567') } },
		'a short sha': { devDependencies: { '@catati/dev': pin(dev.head.slice(0, 12)) } },
		'an upper-case sha': { devDependencies: { '@catati/dev': pin(dev.head.toUpperCase()) } },
		'a branch name': { devDependencies: { '@catati/dev': 'git+https://github.com/catati/dev.git#main' } },
		'an ssh url': { devDependencies: { '@catati/dev': `git+ssh://git@github.com/catati/dev.git#${dev.head}` } },
		'a codeload url': { devDependencies: { '@catati/dev': `https://codeload.github.com/catati/dev/tar.gz/${dev.head}` } },
		'another repo': { devDependencies: { '@catati/dev': `git+https://github.com/catati/devx.git#${dev.head}` } },
		'a removed pin': { devDependencies: {} },
		'a pin moved to dependencies': { dependencies: { '@catati/dev': pin(dev.head) }, devDependencies: {} },
		'a pin added to dependencies': { dependencies: { '@catati/dev': pin(dev.head) }, devDependencies: { '@catati/dev': pin(dev.old) } },
		'a pin in optionalDependencies': { devDependencies: { '@catati/dev': pin(dev.old) }, optionalDependencies: { '@catati/dev': pin(dev.head) } },
		'a pin and another dependency': { devDependencies: { '@catati/dev': pin(dev.head), hono: '4.0.0' } },
		'a pin and a script': { devDependencies: { '@catati/dev': pin(dev.head) }, scripts },
	};
	for (const [name, after] of Object.entries(cases)) {
		await t.test(name, (t) => {
			const fixture = repo(t);
			const base = fixture.commit({ 'package.json': packageJson(before) });
			const head = fixture.commit({ 'package.json': packageJson({ version: '1.0.1', ...after }) });
			assert.deepEqual(runAgainst(fixture, dev.url, [base, head]), packageDoor);
		});
	}
});

test('a @catati/dev pin move is a door when catati/dev main cannot be fetched', (t) => {
	const dev = upstream(t);
	const fixture = repo(t);
	const base = fixture.commit({ 'package.json': packageJson({ devDependencies: { '@catati/dev': pin(dev.old) } }) });
	const head = fixture.commit({ 'package.json': packageJson({ devDependencies: { '@catati/dev': pin(dev.head) } }) });
	const missing = pathToFileURL(join(fixture.parent, 'missing.git')).href;
	assert.deepEqual(runAgainst(fixture, missing, [base, head]), {
		...packageDoor,
		errors: [`catati: check-merge: cannot fetch main from ${missing}, so a @catati/dev pin move stays a door`],
	});
});

test('git config in the repo, in ~/.gitconfig or in the environment cannot point the catati/dev fetch elsewhere', (t) => {
	const dev = upstream(t);
	const fixture = repo(t);
	const { commit, git, parent, run } = fixture;
	const base = commit({ 'package.json': packageJson({ devDependencies: { '@catati/dev': pin(dev.old) } }) });
	const head = commit({ 'package.json': packageJson({ devDependencies: { '@catati/dev': pin(dev.head) } }) });
	const redirect = `url.${dev.url}.insteadOf`;
	const real = 'https://github.com/catati/dev.git';
	git('config', redirect, real);
	const home = join(parent, 'home');
	mkdirSync(home);
	writeFileSync(join(home, '.gitconfig'), `[url "${dev.url}"]\n\tinsteadOf = ${real}\n`);
	const env = { HOME: home, GIT_CONFIG_GLOBAL: join(home, '.gitconfig'), GIT_CONFIG_PARAMETERS: `'${redirect}'='${real}'`, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: redirect, GIT_CONFIG_VALUE_0: real };
	const { status, lines } = run([base, head], fixture.root, env);
	assert.deepEqual({ status, lines }, packageDoor);
});
