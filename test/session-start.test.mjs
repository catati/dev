import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const cli = new URL('../bin/catati-dev.mjs', import.meta.url).pathname;
const rule = readFileSync(new URL('../templates/pstack-models.md', import.meta.url));
const setupScript = readFileSync(new URL('../env/setup.sh', import.meta.url), 'utf8');

function sandbox(t, { git = true, githooks = true, files = {} } = {}) {
	const parent = mkdtempSync(join(tmpdir(), 'catati-dev-'));
	t.after(() => rmSync(parent, { recursive: true, force: true }));
	const root = join(parent, 'repo');
	const home = join(parent, 'home');
	const bin = join(parent, 'bin');
	for (const dir of [root, home, bin]) mkdirSync(dir);
	if (git) execFileSync('git', ['init', '-q'], { cwd: root });
	if (githooks) mkdirSync(join(root, '.githooks'));
	for (const [path, content] of Object.entries(files)) writeFileSync(join(root, path), content);
	const env = { ...process.env, HOME: home, GIT_CEILING_DIRECTORIES: parent, PATH: `${bin}:${process.env.PATH}` };
	return {
		root,
		home,
		rulePath: join(home, '.claude', 'rules', 'pstack-models.md'),
		fake(name, output) {
			writeFileSync(join(bin, name), `#!/bin/sh\necho ${output}\n`);
			chmodSync(join(bin, name), 0o755);
		},
		stall(name) {
			writeFileSync(join(bin, name), '#!/bin/sh\nexec sleep 30\n');
			chmodSync(join(bin, name), 0o755);
		},
		hooksPath: () => spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: root, encoding: 'utf8', env }).stdout.trim(),
		run(from = root) {
			const { status, stdout, stderr } = spawnSync(process.execPath, [cli, 'session-start'], { cwd: from, encoding: 'utf8', env });
			const lines = stdout.split('\n').filter(Boolean);
			const errors = stderr.split('\n').filter(Boolean);
			return errors.length > 0 ? { status, lines, errors } : { status, lines };
		},
	};
}

function snapshot(path) {
	const { mtimeMs, ino } = statSync(path);
	return { bytes: readFileSync(path), mtimeMs, ino };
}

test('a run sets the hooks path and installs the missing model rule', (t) => {
	const box = sandbox(t);
	assert.equal(existsSync(box.rulePath), false);
	assert.deepEqual(box.run(), { status: 0, lines: [] });
	assert.equal(box.hooksPath(), '.githooks');
	assert.deepEqual(readFileSync(box.rulePath), rule);
});

test('a second run changes nothing', (t) => {
	const box = sandbox(t);
	box.run();
	const config = join(box.root, '.git', 'config');
	const before = { config: snapshot(config), rule: snapshot(box.rulePath) };
	assert.deepEqual(box.run(), { status: 0, lines: [] });
	assert.deepEqual({ config: snapshot(config), rule: snapshot(box.rulePath) }, before);
});

test('a rule the user already has is left untouched', (t) => {
	const box = sandbox(t);
	mkdirSync(join(box.home, '.claude', 'rules'), { recursive: true });
	writeFileSync(box.rulePath, 'judgment and prose: sonnet high\n');
	const before = snapshot(box.rulePath);
	assert.deepEqual(box.run(), { status: 0, lines: [] });
	assert.deepEqual(snapshot(box.rulePath), before);
});

test('a repo without .githooks keeps its hooks path unset', (t) => {
	const box = sandbox(t, { githooks: false });
	assert.deepEqual(box.run(), { status: 0, lines: [] });
	assert.equal(box.hooksPath(), '');
});

test('a hooks path the user set elsewhere is kept, with a warning', (t) => {
	const box = sandbox(t);
	execFileSync('git', ['config', 'core.hooksPath', '.husky'], { cwd: box.root });
	assert.deepEqual(box.run(), { status: 0, lines: ['catati-dev: hooks-path: core.hooksPath is .husky, not .githooks; left as is'] });
	assert.equal(box.hooksPath(), '.husky');
});

test('a run from a subdirectory sets up the whole repo', (t) => {
	const box = sandbox(t);
	mkdirSync(join(box.root, 'web'));
	assert.deepEqual(box.run(join(box.root, 'web')), { status: 0, lines: [] });
	assert.equal(box.hooksPath(), '.githooks');
});

test('a run outside a git repository prints one line and exits with 2', (t) => {
	const box = sandbox(t, { git: false });
	assert.deepEqual(box.run(), { status: 2, lines: [], errors: ['catati-dev: not inside a git repository'] });
	assert.equal(existsSync(box.rulePath), false);
});

test('a node older than 24.15 is a warning, and the other steps still run', (t) => {
	const box = sandbox(t);
	box.fake('node', '24.14.9');
	assert.deepEqual(box.run(), { status: 0, lines: ['catati-dev: node 24.14.9 is older than 24.15'] });
	assert.equal(box.hooksPath(), '.githooks');
	assert.deepEqual(readFileSync(box.rulePath), rule);
});

test('a pnpm that differs from packageManager is a warning', (t) => {
	const box = sandbox(t, { files: { 'package.json': '{ "packageManager": "pnpm@10.30.3+sha512.abc" }\n' } });
	box.fake('corepack', '10.4.1');
	assert.deepEqual(box.run(), { status: 0, lines: ['catati-dev: corepack runs pnpm 10.4.1, but packageManager asks for 10.30.3'] });
	box.fake('corepack', '10.30.3');
	assert.deepEqual(box.run(), { status: 0, lines: [] });
});

test('a corepack that hangs is a warning within the time bound', (t) => {
	const box = sandbox(t, { files: { 'package.json': '{ "packageManager": "pnpm@10.30.3" }\n' } });
	box.stall('corepack');
	const started = performance.now();
	const result = box.run();
	const seconds = (performance.now() - started) / 1000;
	assert.deepEqual(result, {
		status: 0,
		lines: ['catati-dev: corepack pnpm --version timed out after 3 s, so pnpm 10.30.3 from packageManager is not available'],
	});
	assert.ok(seconds < 5, `took ${seconds.toFixed(1)} s`);
	assert.equal(box.hooksPath(), '.githooks');
});

test('env/setup.sh carries the model rule byte for byte', () => {
	const embedded = setupScript.match(/<<'RULE'\n([\s\S]*?\n)RULE\n/)?.[1];
	assert.equal(embedded, rule.toString());
});

test('the env/setup.sh rule step installs a missing rule once and keeps an existing one', (t) => {
	const step = setupScript.match(/# --- pstack model rule -+\n[\s\S]*?\n(?=# --- )/)[0];
	const box = sandbox(t);
	const runStep = () => execFileSync('bash', ['-euo', 'pipefail', '-c', step], { env: { PATH: process.env.PATH, HOME: box.home } });
	runStep();
	const first = snapshot(box.rulePath);
	assert.deepEqual(first.bytes, rule);
	runStep();
	assert.deepEqual(snapshot(box.rulePath), first);
	writeFileSync(box.rulePath, 'judgment and prose: sonnet high\n');
	const own = snapshot(box.rulePath);
	runStep();
	assert.deepEqual(snapshot(box.rulePath), own);
	assert.deepEqual(readdirSync(join(box.home, '.claude', 'rules')), ['pstack-models.md']);
});
