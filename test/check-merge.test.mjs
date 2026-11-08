import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const cli = new URL('../bin/catati-dev.mjs', import.meta.url).pathname;

const makefile = (deployRecipe, testRecipe = '\tnode --test') =>
	['.PHONY: test deploy-prod', 'test:', testRecipe, '', 'deploy-prod: build', deployRecipe, '', 'build:', '\t@true', ''].join('\n');

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
	const run = (args, cwd = root) => {
		const { status, stdout, stderr } = spawnSync(process.execPath, [cli, 'check-merge', ...args], { cwd, encoding: 'utf8', env });
		const lines = stdout.split('\n').filter(Boolean);
		const errors = stderr.split('\n').filter(Boolean);
		return errors.length > 0 ? { status, lines, errors } : { status, lines };
	};
	return { root, parent, git, commit, run };
}

const clean = { status: 0, lines: ['check-merge: no one-way-door path'] };

test('a diff that touches no door path passes', (t) => {
	const { commit, run } = repo(t);
	const base = commit({ 'README.md': 'a\n', 'lib/x.mjs': '1\n', Makefile: makefile('\t./deploy.sh') });
	const head = commit({ 'README.md': 'b\n', 'lib/x.mjs': '2\n', 'templates/issue.yml': 'x\n', 'env/.env.example': 'A=\n', '.github/CODEOWNERS': '* @x\n' });
	assert.deepEqual(run([base, head]), clean);
});

const doorExamples = [
	'.github/workflows/ci.yml',
	'.github/rulesets/main.json',
	'.claude/settings.json',
	'env/setup.sh',
	'wrangler.toml',
	'web/wrangler.json',
	'apps/api/wrangler.jsonc',
	'firebase.json',
	'firestore.rules',
	'storage.rules',
	'migrations/0001_init.sql',
	'functions/db/migrations/0002.sql',
	'templates/pr-format.yml',
	'templates/claude-settings.json',
	'templates/githooks/pre-push',
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
	const head = commit({ 'docs/firebase.json': 'x\n', 'pkg/.github/workflows/ci.yml': 'x\n', 'pkg/env/setup.sh': 'x\n', 'migrations.md': 'x\n' });
	assert.deepEqual(run([base, head]), clean);
});

test('a Makefile change under a deploy- target is a one-way door, one elsewhere is not', (t) => {
	const { commit, run } = repo(t);
	const base = commit({ Makefile: makefile('\t./deploy.sh prod') });
	const testOnly = commit({ Makefile: makefile('\t./deploy.sh prod', '\tnode --test --watch') });
	assert.deepEqual(run([base, testOnly]), clean);
	const deploy = commit({ Makefile: makefile('\t./deploy.sh prod --force', '\tnode --test --watch') });
	assert.deepEqual(run([testOnly, deploy]), { status: 1, lines: ['one-way-door: Makefile'] });
});

test('adding or removing a deploy- target in a nested Makefile is a one-way door', (t) => {
	const { commit, run } = repo(t);
	const base = commit({ 'web/Makefile': 'test:\n\t@true\n' });
	const added = commit({ 'web/Makefile': 'test:\n\t@true\n\ndeploy-dev:\n\twrangler deploy\n' });
	assert.deepEqual(run([base, added]), { status: 1, lines: ['one-way-door: web/Makefile'] });
	const removed = commit({}, { remove: ['web/Makefile'] });
	assert.deepEqual(run([added, removed]), { status: 1, lines: ['one-way-door: web/Makefile'] });
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
