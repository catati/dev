import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const cli = new URL('../bin/catati.mjs', import.meta.url).pathname;
const template = (name) => readFileSync(new URL(`../templates/${name}`, import.meta.url));

const managed = {
	'.github/ISSUE_TEMPLATE/issue.yml': 'issue.yml',
	'.github/pull_request_template.md': 'pull_request_template.md',
	'.github/workflows/pr-format.yml': 'pr-format.yml',
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
	const parent = mkdtempSync(join(tmpdir(), 'catati-'));
	t.after(() => rmSync(parent, { recursive: true, force: true }));
	const root = join(parent, 'repo');
	const home = join(parent, 'home');
	const outside = join(parent, 'outside');
	for (const dir of [root, home, outside]) mkdirSync(dir);
	if (git) execFileSync('git', ['init', '-q'], { cwd: root });
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	const env = { ...process.env, HOME: home, GIT_CEILING_DIRECTORIES: parent };
	return {
		root,
		outside,
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

function tree(dir) {
	return readdirSync(dir, { recursive: true, withFileTypes: true }).map((entry) => {
		const full = join(entry.parentPath, entry.name);
		const { mode, mtimeMs } = lstatSync(full);
		return { full, mode, mtimeMs, bytes: entry.isFile() ? readFileSync(full) : undefined };
	});
}

const skips = ({ lines }) => lines.filter((line) => line.startsWith('skipped '));

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

const repoOwners = ['/firestore.rules @catati-ops', '/docs/adr/ @catati-ops', ''].join('\n');

test('a CODEOWNERS file that has every template line keeps its own lines', (t) => {
	const content = `${repoOwners}\n${template('CODEOWNERS')}`;
	const box = sandbox(t, { files: { '.github/CODEOWNERS': content } });
	assert.ok(box.run().lines.includes('unchanged .github/CODEOWNERS'));
	assert.equal(box.file('.github/CODEOWNERS').toString(), content);
});

test('CODEOWNERS gets the missing template lines at the end and keeps every other line', (t) => {
	const lines = template('CODEOWNERS').toString().split('\n').filter(Boolean);
	const content = `${repoOwners}${lines[1]}\n/Makefile @someone-else`;
	const box = sandbox(t, { files: { '.github/CODEOWNERS': content } });
	assert.ok(box.run().lines.includes('updated .github/CODEOWNERS'));
	const missing = lines.filter((line) => line !== lines[1]);
	assert.equal(box.file('.github/CODEOWNERS').toString(), `${content}\n${missing.join('\n')}\n`);
	const before = box.snapshot();
	assert.ok(box.run().lines.includes('unchanged .github/CODEOWNERS'));
	assert.deepEqual(box.snapshot(), before);
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

test('a managed directory that is a symlink out of the repo is skipped, and nothing outside changes', async (t) => {
	const cases = {
		'.github': ['.github/ISSUE_TEMPLATE/issue.yml', '.github/pull_request_template.md', '.github/workflows/pr-format.yml', '.github/CODEOWNERS'],
		'.github/ISSUE_TEMPLATE': ['.github/ISSUE_TEMPLATE/issue.yml'],
		'.githooks': ['.githooks/pre-commit', '.githooks/pre-push'],
		'.claude': ['.claude/settings.json'],
	};
	for (const [dir, skipped] of Object.entries(cases)) {
		await t.test(dir, (t) => {
			const box = sandbox(t);
			writeFileSync(join(box.outside, 'keep'), 'outside\n');
			mkdirSync(dirname(join(box.root, dir)), { recursive: true });
			symlinkSync(box.outside, join(box.root, dir));
			const before = tree(box.outside);
			const result = box.run();
			assert.equal(result.status, 0);
			assert.deepEqual(skips(result), skipped.map((path) => `skipped ${path}: resolves outside the repo`));
			assert.deepEqual(tree(box.outside), before);
			assert.equal(readlinkSync(join(box.root, dir)), box.outside);
		});
	}
});

test('a managed directory that is a symlink to another place in the repo is skipped', (t) => {
	const box = sandbox(t, { files: { 'shared/hooks/README': 'shared\n' } });
	symlinkSync('shared/hooks', join(box.root, '.githooks'));
	const before = tree(join(box.root, 'shared'));
	const result = box.run();
	assert.equal(result.status, 0);
	assert.deepEqual(skips(result), [
		'skipped .githooks/pre-commit: has a parent directory that is a symlink; left as is',
		'skipped .githooks/pre-push: has a parent directory that is a symlink; left as is',
	]);
	assert.deepEqual(tree(join(box.root, 'shared')), before);
});

test('a dangling symlinked directory is skipped', (t) => {
	const box = sandbox(t);
	symlinkSync(join(box.outside, 'gone'), join(box.root, '.claude'));
	const result = box.run();
	assert.equal(result.status, 0);
	assert.deepEqual(skips(result), ['skipped .claude/settings.json: resolves outside the repo']);
	assert.equal(existsSync(join(box.outside, 'gone')), false);
});

test('a run that skips a file ends with one line on stderr and exits with 0', async (t) => {
	for (const args of [[], ['--dry-run']]) {
		await t.test(args.join(' ') || 'a real run', (t) => {
			const box = sandbox(t, { files: { '.claude/settings.json': '[]\n' } });
			symlinkSync(box.outside, join(box.root, '.githooks'));
			const result = box.run(...args);
			assert.equal(result.status, 0);
			assert.equal(skips(result).length, 3);
			assert.deepEqual(result.errors, ['catati: setup skipped 3 file(s); the standard is not fully applied']);
		});
	}
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
	assert.deepEqual(box.run(), { status: 2, lines: [], errors: ['catati: not inside a git repository'] });
	assert.equal(existsSync(join(box.root, '.github')), false);
});

test('an unknown option prints one line and exits with 2', (t) => {
	const box = sandbox(t);
	assert.deepEqual(box.run('--force'), { status: 2, lines: [], errors: ['catati: setup takes only --dry-run, not --force'] });
	assert.equal(existsSync(join(box.root, '.github')), false);
});
