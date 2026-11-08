import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const cli = new URL('../bin/catati-dev.mjs', import.meta.url).pathname;
const template = (name) => readFileSync(new URL(`../templates/${name}`, import.meta.url));

const managed = {
	'.github/ISSUE_TEMPLATE/issue.yml': 'issue.yml',
	'.github/pull_request_template.md': 'pull_request_template.md',
	'.github/CODEOWNERS': 'CODEOWNERS',
	'.githooks/pre-commit': 'githooks/pre-commit',
	'.githooks/pre-push': 'githooks/pre-push',
	'.node-version': 'node-version',
	'.claude/settings.json': 'claude-settings.json',
};
const paths = Object.keys(managed);
const hooks = ['.githooks/pre-commit', '.githooks/pre-push'];
const remaining = ['make-targets: Makefile: file is missing', 'ci-workflow: .github/workflows/ci.yml: file is missing'];
const every = (action) => paths.map((path) => `${action} ${path}`);

function sandbox(t, { git = true, files = {} } = {}) {
	const parent = mkdtempSync(join(tmpdir(), 'catati-dev-'));
	t.after(() => rmSync(parent, { recursive: true, force: true }));
	const root = join(parent, 'repo');
	const home = join(parent, 'home');
	for (const dir of [root, home]) mkdirSync(dir);
	if (git) execFileSync('git', ['init', '-q'], { cwd: root });
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	const env = { ...process.env, HOME: home, GIT_CEILING_DIRECTORIES: parent };
	return {
		root,
		file: (path) => readFileSync(join(root, path)),
		run(...args) {
			const { status, stdout, stderr } = spawnSync(process.execPath, [cli, 'setup', ...args], { cwd: root, encoding: 'utf8', env });
			const lines = stdout.split('\n').filter(Boolean);
			const errors = stderr.split('\n').filter(Boolean);
			return errors.length > 0 ? { status, lines, errors } : { status, lines };
		},
		treeHash() {
			const index = { ...env, GIT_INDEX_FILE: join(parent, 'index') };
			rmSync(index.GIT_INDEX_FILE, { force: true });
			execFileSync('git', ['add', '-A'], { cwd: root, env: index });
			return execFileSync('git', ['write-tree'], { cwd: root, env: index, encoding: 'utf8' }).trim();
		},
		snapshot() {
			return Object.fromEntries(
				paths.map((path) => {
					const { mtimeMs, ino, mode } = statSync(join(root, path));
					return [path, { bytes: readFileSync(join(root, path)), mtimeMs, ino, mode }];
				}),
			);
		},
	};
}

const isExecutable = (box, path) => (statSync(join(box.root, path)).mode & 0o111) === 0o111;

const agentsStyle = `{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "ask": [
      "Bash(make deploy-prod*)",
      "Bash(gh pr merge:*)"
    ],
    "deny": [
      "Read(**/.prod.env)"
    ]
  },
  "sandbox": {
    "excludedCommands": [
      "git *"
    ]
  }
}
`;

test('a first run creates every managed file, then prints what check still finds', (t) => {
	const box = sandbox(t);
	assert.deepEqual(box.run(), { status: 0, lines: [...every('created'), ...remaining] });
	for (const [path, name] of Object.entries(managed)) assert.deepEqual(box.file(path), template(name), path);
	for (const path of hooks) assert.ok(isExecutable(box, path), `${path} is executable`);
	assert.equal(isExecutable(box, '.node-version'), false);
});

test('a second run changes nothing', (t) => {
	const box = sandbox(t);
	box.run();
	const before = box.snapshot();
	assert.deepEqual(box.run(), { status: 0, lines: [...every('unchanged'), ...remaining] });
	assert.deepEqual(box.snapshot(), before);
});

test('the settings merge adds the missing rule and keeps every other byte', (t) => {
	const box = sandbox(t, { files: { '.claude/settings.json': agentsStyle } });
	assert.ok(box.run().lines.includes('updated .claude/settings.json'));
	const expected = agentsStyle.replace('"Bash(gh pr merge:*)"\n', '"Bash(gh pr merge:*)",\n      "mcp__github__merge_pull_request"\n');
	assert.equal(box.file('.claude/settings.json').toString(), expected);
	assert.ok(box.run().lines.includes('unchanged .claude/settings.json'));
});

test('the settings merge adds a missing permissions block at the end', (t) => {
	const box = sandbox(t, { files: { '.claude/settings.json': '{\n\t"model": "opus"\n}' } });
	box.run();
	assert.equal(
		box.file('.claude/settings.json').toString(),
		'{\n\t"model": "opus",\n\t"permissions": {\n\t\t"ask": [\n\t\t\t"Bash(gh pr merge:*)",\n\t\t\t"mcp__github__merge_pull_request"\n\t\t]\n\t}\n}',
	);
});

test('a settings file the merge cannot rewrite safely is left as is', async (t) => {
	const cases = {
		'{ "permissions": { "ask": [] } }\n': 'skipped .claude/settings.json: has formatting a rewrite would change; left as is',
		'{\n  "permissions": {\n    "ask": "Bash(*)"\n  }\n}\n': 'skipped .claude/settings.json: permissions.ask is not a list; left as is',
		'[]\n': 'skipped .claude/settings.json: the top level is not an object; left as is',
		'{ "permissions": \n': 'skipped .claude/settings.json: is not valid JSON; left as is',
	};
	for (const [content, line] of Object.entries(cases)) {
		await t.test(line, (t) => {
			const box = sandbox(t, { files: { '.claude/settings.json': content } });
			const { status, lines } = box.run();
			assert.equal(status, 0);
			assert.ok(lines.includes(line), lines.join('\n'));
			assert.equal(box.file('.claude/settings.json').toString(), content);
		});
	}
});

test('a differing managed file is updated, and a hook gets its exec bit back', (t) => {
	const box = sandbox(t, { files: { '.githooks/pre-push': '#!/bin/sh\nexit 0\n', '.node-version': '22\n' } });
	chmodSync(join(box.root, '.githooks/pre-push'), 0o644);
	const { lines } = box.run();
	assert.ok(lines.includes('updated .githooks/pre-push'));
	assert.ok(lines.includes('updated .node-version'));
	assert.deepEqual(box.file('.githooks/pre-push'), template('githooks/pre-push'));
	assert.ok(isExecutable(box, '.githooks/pre-push'));
	assert.deepEqual(box.file('.node-version'), template('node-version'));
});

test('a hook with the right body but no exec bit is updated', (t) => {
	const box = sandbox(t, { files: { '.githooks/pre-commit': template('githooks/pre-commit') } });
	chmodSync(join(box.root, '.githooks/pre-commit'), 0o644);
	assert.ok(box.run().lines.includes('updated .githooks/pre-commit'));
	assert.ok(isExecutable(box, '.githooks/pre-commit'));
});

test('a managed path that is a symlink is left as is', (t) => {
	const box = sandbox(t, { files: { 'shared/CODEOWNERS': '* @someone\n' } });
	mkdirSync(join(box.root, '.github'));
	symlinkSync('../shared/CODEOWNERS', join(box.root, '.github', 'CODEOWNERS'));
	assert.ok(box.run().lines.includes('skipped .github/CODEOWNERS: is not a regular file; left as is'));
	assert.ok(lstatSync(join(box.root, '.github', 'CODEOWNERS')).isSymbolicLink());
	assert.equal(readlinkSync(join(box.root, '.github', 'CODEOWNERS')), '../shared/CODEOWNERS');
});

test('--dry-run prints what a run would do and writes nothing', (t) => {
	const box = sandbox(t, { files: { '.claude/settings.json': agentsStyle, '.node-version': '22\n' } });
	const before = box.treeHash();
	const dry = box.run('--dry-run');
	assert.equal(box.treeHash(), before);
	assert.equal(existsSync(join(box.root, '.githooks')), false);
	assert.deepEqual(dry, box.run());
	assert.notEqual(box.treeHash(), before);
});

test('--dry-run shows the findings that would be left after setup', (t) => {
	const makefile = ['install test e2e verify lint help:', '\t@true', ''].join('\n');
	const box = sandbox(t, { files: { Makefile: makefile, '.github/workflows/ci.yml': 'on: push\n' } });
	assert.deepEqual(box.run('--dry-run'), { status: 0, lines: every('created') });
});

test('a run outside a git repository prints one line and exits with 2', (t) => {
	const box = sandbox(t, { git: false });
	assert.deepEqual(box.run(), { status: 2, lines: [], errors: ['catati-dev: not inside a git repository'] });
	assert.equal(existsSync(join(box.root, '.github')), false);
});

test('an unknown option prints one line and exits with 2', (t) => {
	const box = sandbox(t);
	assert.deepEqual(box.run('--force'), { status: 2, lines: [], errors: ['catati-dev: setup takes only --dry-run, not --force'] });
	assert.equal(existsSync(join(box.root, '.github')), false);
});
