import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const script = new URL('../plugins/catati/hooks/session-start.mjs', import.meta.url).pathname;
const rule = readFileSync(new URL('../plugins/catati/rules/pstack-models.md', import.meta.url));

function box(t) {
	const parent = mkdtempSync(join(tmpdir(), 'catati-plugin-start-'));
	t.after(() => rmSync(parent, { recursive: true, force: true }));
	const home = join(parent, 'home');
	const project = join(parent, 'project');
	mkdirSync(home);
	mkdirSync(project);
	const env = { PATH: process.env.PATH, HOME: home, GIT_CEILING_DIRECTORIES: parent };
	const repo = (path, { githooks = true } = {}) => {
		mkdirSync(path, { recursive: true });
		execFileSync('git', ['init', '-q'], { cwd: path, env });
		if (githooks) mkdirSync(join(path, '.githooks'));
		return path;
	};
	const hooksPath = (path) => spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: path, encoding: 'utf8', env }).stdout.trim();
	const run = (cwd, projectDir, entry = script) => {
		const result = spawnSync(process.execPath, [entry], { cwd, encoding: 'utf8', env: projectDir ? { ...env, CLAUDE_PROJECT_DIR: projectDir } : env });
		return { status: result.status, out: result.stdout + result.stderr };
	};
	return { parent, home, project, repo, hooksPath, run, rulePath: join(home, '.claude', 'rules', 'pstack-models.md') };
}

test('a project folder that is no repo gets the git hooks path set in each repo below it', (t) => {
	const b = box(t);
	const catHotel = b.repo(join(b.project, 'cat-hotel'));
	const knowledge = b.repo(join(b.project, 'knowledge'), { githooks: false });
	writeFileSync(join(b.project, 'notes.txt'), 'x');
	assert.deepEqual(b.run(b.project, b.project), { status: 0, out: '' });
	assert.equal(b.hooksPath(catHotel), '.githooks');
	assert.equal(b.hooksPath(knowledge), '');
	assert.deepEqual(readFileSync(b.rulePath), rule);
});

test('a project folder inside a repo sets that repo only, from CLAUDE_PROJECT_DIR or the cwd', (t) => {
	const b = box(t);
	const repo = b.repo(join(b.project, 'repo'));
	mkdirSync(join(repo, 'sub'));
	assert.equal(b.run(b.project, join(repo, 'sub')).status, 0);
	assert.equal(b.hooksPath(repo), '.githooks');
	const other = b.repo(join(b.project, 'other'));
	assert.equal(b.run(other).status, 0);
	assert.equal(b.hooksPath(other), '.githooks');
});

test('a hooks path set to another folder and an existing model rule are left as they are', (t) => {
	const b = box(t);
	const repo = b.repo(join(b.project, 'repo'));
	execFileSync('git', ['config', 'core.hooksPath', '.husky'], { cwd: repo });
	mkdirSync(join(b.home, '.claude', 'rules'), { recursive: true });
	writeFileSync(b.rulePath, 'mine');
	const { status, out } = b.run(b.project, b.project);
	assert.equal(status, 0);
	assert.equal(out, `catati: ${repo}: hooks-path: core.hooksPath is .husky, not .githooks; left as is\n`);
	assert.equal(b.hooksPath(repo), '.husky');
	assert.equal(readFileSync(b.rulePath, 'utf8'), 'mine');
});

test('a project folder that cannot be read still installs the model rule and exits 0', (t) => {
	const b = box(t);
	const { status, out } = b.run(b.project, join(b.project, 'missing'));
	assert.deepEqual({ status, out }, { status: 0, out: '' });
	assert.ok(existsSync(b.rulePath));
});

test('the session setup runs when its script is started through a symlink', (t) => {
	const b = box(t);
	const link = join(b.parent, 'session-start.mjs');
	symlinkSync(script, link);
	assert.deepEqual(b.run(b.project, b.project, link), { status: 0, out: '' });
	assert.deepEqual(readFileSync(b.rulePath), rule);
});
