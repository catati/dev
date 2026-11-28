import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const cli = new URL('../plugins/catati/scripts/catati.mjs', import.meta.url).pathname;
const template = (name) => readFileSync(new URL(`../plugins/catati/templates/${name}`, import.meta.url));

const managed = {
	'.github/ISSUE_TEMPLATE/issue.yml': 'issue.yml',
	'.githooks/pre-commit': 'githooks/pre-commit',
	'.githooks/pre-push': 'githooks/pre-push',
	'.node-version': 'node-version',
	'.github/workflows/verifier-record.yml': 'verifier-record/workflow.yml',
	'.github/verifier-record/verifier-record.mjs': 'verifier-record/verifier-record.mjs',
	'.github/verifier-record/doors.md': 'verifier-record/doors.md',
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

test('setup neither writes nor removes .github/CODEOWNERS', (t) => {
	const fresh = sandbox(t);
	assert.deepEqual(fresh.run(), { status: 0, lines: [...every('created'), ...remaining] });
	assert.equal(existsSync(join(fresh.root, '.github/CODEOWNERS')), false);
	const content = '/.github/workflows/ @catati-ops\n/docs/adr/ @someone\n';
	const owned = sandbox(t, { files: { '.github/CODEOWNERS': content } });
	assert.deepEqual(owned.run(), { status: 0, lines: [...every('created'), ...remaining] });
	assert.equal(owned.file('.github/CODEOWNERS').toString(), content);
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

const retired = ['.github/pull_request_template.md'];

test('a run removes each file setup no longer manages, and a second run reports nothing', (t) => {
	const box = sandbox(t, { files: Object.fromEntries(retired.map((path) => [path, 'old copy\n'])) });
	const first = box.run();
	assert.deepEqual(
		first.lines.filter((line) => line.startsWith('removed ')),
		retired.map((path) => `removed ${path}`),
	);
	for (const path of retired) assert.equal(existsSync(join(box.root, path)), false, path);
	assert.ok(existsSync(join(box.root, '.github/ISSUE_TEMPLATE/issue.yml')));
	assert.deepEqual(box.run(), { status: 0, lines: [...every('unchanged'), ...remaining] });
});

test('--dry-run reports a retired file it would remove and keeps it', (t) => {
	const box = sandbox(t, { files: { '.github/pull_request_template.md': 'old copy\n' } });
	assert.ok(box.run('--dry-run').lines.includes('removed .github/pull_request_template.md'));
	assert.equal(box.file('.github/pull_request_template.md').toString(), 'old copy\n');
});

test('a retired path that is not a regular file is left as is', (t) => {
	const box = sandbox(t);
	mkdirSync(join(box.root, '.github/pull_request_template.md'), { recursive: true });
	const result = box.run();
	assert.ok(result.lines.includes('skipped .github/pull_request_template.md: is not a regular file; left as is'));
	assert.ok(statSync(join(box.root, '.github/pull_request_template.md')).isDirectory());
	assert.deepEqual(result.errors, ['catati: setup skipped 1 file(s); the standard is not fully applied']);
});

test('a hook with the right body but no exec bit is updated', (t) => {
	const box = sandbox(t, { files: { '.githooks/pre-commit': template('githooks/pre-commit') } });
	chmodSync(join(box.root, '.githooks/pre-commit'), 0o644);
	assert.ok(box.run().lines.includes('updated .githooks/pre-commit'));
	assert.ok(isExecutable(box, '.githooks/pre-commit'));
});

test('a managed path that is a symlink is left as is', (t) => {
	const box = sandbox(t, { files: { 'shared/issue.yml': 'name: own\n' } });
	mkdirSync(join(box.root, '.github/ISSUE_TEMPLATE'), { recursive: true });
	symlinkSync('../../shared/issue.yml', join(box.root, '.github/ISSUE_TEMPLATE/issue.yml'));
	assert.ok(box.run().lines.includes('skipped .github/ISSUE_TEMPLATE/issue.yml: is not a regular file; left as is'));
	assert.ok(lstatSync(join(box.root, '.github/ISSUE_TEMPLATE/issue.yml')).isSymbolicLink());
	assert.equal(readlinkSync(join(box.root, '.github/ISSUE_TEMPLATE/issue.yml')), '../../shared/issue.yml');
});

test('a managed directory that is a symlink out of the repo is skipped, and nothing outside changes', async (t) => {
	const cases = {
		'.github': [...paths.filter((path) => path.startsWith('.github/')), ...retired],
		'.github/ISSUE_TEMPLATE': ['.github/ISSUE_TEMPLATE/issue.yml'],
		'.githooks': ['.githooks/pre-commit', '.githooks/pre-push'],
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
	symlinkSync(join(box.outside, 'gone'), join(box.root, '.githooks'));
	const result = box.run();
	assert.equal(result.status, 0);
	assert.deepEqual(skips(result), ['skipped .githooks/pre-commit: resolves outside the repo', 'skipped .githooks/pre-push: resolves outside the repo']);
	assert.equal(existsSync(join(box.outside, 'gone')), false);
});

test('a run that skips a file ends with one line on stderr and exits with 0', async (t) => {
	for (const args of [[], ['--dry-run']]) {
		await t.test(args.join(' ') || 'a real run', (t) => {
			const box = sandbox(t);
			symlinkSync(box.outside, join(box.root, '.githooks'));
			const result = box.run(...args);
			assert.equal(result.status, 0);
			assert.equal(skips(result).length, 2);
			assert.deepEqual(result.errors, ['catati: setup skipped 2 file(s); the standard is not fully applied']);
		});
	}
});

test('--dry-run prints what a run would do and writes nothing', (t) => {
	const box = sandbox(t, { files: { '.node-version': '22\n' } });
	const before = box.treeHash();
	const dry = box.run('--dry-run');
	assert.equal(box.treeHash(), before);
	assert.equal(existsSync(join(box.root, '.githooks')), false);
	assert.deepEqual(dry, box.run());
	assert.notEqual(box.treeHash(), before);
});

test('--dry-run shows the findings that would be left after setup', (t) => {
	const makefile = ['install test e2e verify lint help format staged-check:', '\t@true', ''].join('\n');
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

test('a copy of the plugin folder alone runs setup and check, so a synced plugin needs no catati/dev clone', (t) => {
	const parent = mkdtempSync(join(tmpdir(), 'catati-plugin-'));
	t.after(() => rmSync(parent, { recursive: true, force: true }));
	const plugin = join(parent, 'plugin');
	execFileSync('cp', ['-R', new URL('../plugins/catati', import.meta.url).pathname, plugin]);
	const root = join(parent, 'repo');
	mkdirSync(root);
	execFileSync('git', ['init', '-q'], { cwd: root });
	const env = { ...process.env, GIT_CEILING_DIRECTORIES: parent };
	const run = (command) => spawnSync('node', [join(plugin, 'scripts', 'catati.mjs'), command], { cwd: root, env, encoding: 'utf8' });
	const setup = run('setup');
	assert.equal(setup.status, 0, setup.stderr);
	assert.deepEqual(setup.stdout.trim().split('\n'), [...every('created'), ...remaining]);
	const check = run('check');
	assert.equal(check.status, 1);
	assert.deepEqual(check.stdout.trim().split('\n'), remaining);
});

const catsperSettings = readFileSync(new URL('./fixtures/catsper-settings.json', import.meta.url), 'utf8');
const settingsLines = ({ lines }) => lines.filter((line) => line.includes('.claude/settings.json'));
const moved = JSON.parse(catsperSettings).permissions.ask.filter((rule) => rule !== 'Bash(firebase deploy*)');

test("setup strips the shared and retired ask rules and the merge-audit hook from catsper's settings, and a second run prints nothing for them", (t) => {
	const box = sandbox(t, { files: { '.claude/settings.json': catsperSettings } });
	assert.equal(moved.length, 31);
	assert.deepEqual(settingsLines(box.run()), [
		...moved.map((rule) => `removed .claude/settings.json ask rule ${rule}`),
		'removed .claude/settings.json hook merge-audit.mjs --hook',
		'updated .claude/settings.json',
	]);
	const text = box.file('.claude/settings.json').toString();
	const settings = JSON.parse(text);
	assert.ok(text.endsWith('}\n'));
	assert.deepEqual(Object.keys(settings), ['permissions', 'sandbox']);
	assert.deepEqual(settings.permissions.ask, ['Bash(firebase deploy*)']);
	assert.deepEqual(settings.sandbox, JSON.parse(catsperSettings).sandbox);
	assert.deepEqual(settingsLines(box.run()), []);
	assert.equal(box.file('.claude/settings.json').toString(), text);
});

test('setup keeps other hooks and drops only emptied keys', (t) => {
	const own = { matcher: 'Bash', hooks: [{ type: 'command', command: 'node lint.mjs' }] };
	const mixed = { matcher: 'Bash', hooks: [{ type: 'command', command: 'node scripts/merge-audit.mjs --hook' }, { type: 'command', command: 'node other.mjs' }] };
	const input = { permissions: { ask: ['Bash(gh secret*)'], allow: ['Bash(ls)'] }, hooks: { PreToolUse: [own, mixed], Stop: [own] } };
	const box = sandbox(t, { files: { '.claude/settings.json': JSON.stringify(input) } });
	box.run();
	assert.deepEqual(JSON.parse(box.file('.claude/settings.json')), {
		permissions: { allow: ['Bash(ls)'] },
		hooks: { PreToolUse: [own, { matcher: 'Bash', hooks: [{ type: 'command', command: 'node other.mjs' }] }], Stop: [own] },
	});
});

test('setup leaves a settings file with nothing to strip byte for byte', (t) => {
	const text = '{"permissions":{"ask":["Bash(firebase deploy*)"]}}';
	const box = sandbox(t, { files: { '.claude/settings.json': text } });
	assert.deepEqual(settingsLines(box.run()), []);
	assert.equal(box.file('.claude/settings.json').toString(), text);
});

test('--dry-run reports the settings removals and writes nothing', (t) => {
	const box = sandbox(t, { files: { '.claude/settings.json': catsperSettings } });
	assert.equal(settingsLines(box.run('--dry-run')).at(-1), 'updated .claude/settings.json');
	assert.equal(box.file('.claude/settings.json').toString(), catsperSettings);
});

test('a settings file that is not valid JSON is skipped', (t) => {
	const box = sandbox(t, { files: { '.claude/settings.json': '{ "permissions": ' } });
	const result = box.run();
	assert.equal(result.status, 0);
	const [line] = settingsLines(result);
	assert.match(line, /^skipped \.claude\/settings\.json: \S/);
	assert.equal(box.file('.claude/settings.json').toString(), '{ "permissions": ');
});
