import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const script = new URL('../plugins/catati/hooks/worktree.mjs', import.meta.url).pathname;

function box(t) {
	const parent = realpathSync(mkdtempSync(join(tmpdir(), 'catati-worktree-')));
	t.after(() => rmSync(parent, { recursive: true, force: true }));
	const home = join(parent, 'home');
	const project = join(parent, 'project');
	mkdirSync(home);
	mkdirSync(project);
	const env = {
		PATH: process.env.PATH,
		HOME: home,
		GIT_CEILING_DIRECTORIES: parent,
		GIT_AUTHOR_NAME: 'test',
		GIT_AUTHOR_EMAIL: 'test@example.com',
		GIT_COMMITTER_NAME: 'test',
		GIT_COMMITTER_EMAIL: 'test@example.com',
	};
	const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
	const gitStatus = (cwd, ...args) => spawnSync('git', args, { cwd, env, encoding: 'utf8' });
	const repo = (name) => {
		const path = join(project, name);
		mkdirSync(path, { recursive: true });
		git(path, 'init', '-q', '-b', 'main');
		writeFileSync(join(path, 'README.md'), name);
		git(path, 'add', '.');
		git(path, 'commit', '-q', '-m', 'init');
		return path;
	};
	const input = (event, fields) => JSON.stringify({ session_id: 's', hook_event_name: event, ...fields });
	const hook = (event, fields) => {
		const result = spawnSync(process.execPath, [script], { cwd: fields.cwd ?? project, env, encoding: 'utf8', input: input(event, fields) });
		return { status: result.status, stdout: result.stdout, stderr: result.stderr };
	};
	const hookAsync = (event, fields) =>
		new Promise((resolve) => {
			const child = spawn(process.execPath, [script], { cwd: fields.cwd ?? project, env });
			let stdout = '';
			let stderr = '';
			child.stdout.on('data', (chunk) => (stdout += chunk));
			child.stderr.on('data', (chunk) => (stderr += chunk));
			child.on('close', (status) => resolve({ status, stdout, stderr }));
			child.stdin.end(input(event, fields));
		});
	const create = (name, cwd = project) => hook('WorktreeCreate', { cwd, name });
	const remove = (worktree_path) => hook('WorktreeRemove', { cwd: project, worktree_path });
	const worktrees = (path) => git(path, 'worktree', 'list', '--porcelain');
	const branches = (path) => git(path, 'branch', '--list', 'worktree-*', '--format=%(refname:short)');
	return { project, git, gitStatus, repo, hook, hookAsync, create, remove, worktrees, branches };
}

test('folder mode makes one locked worktree per child repo at HEAD and prints only the path', (t) => {
	const b = box(t);
	const catHotel = b.repo('cat-hotel');
	const dev = b.repo('dev');
	writeFileSync(join(dev, 'wip.txt'), 'x');
	b.git(dev, 'add', '.');
	b.git(dev, 'commit', '-q', '-m', 'unpushed work');
	writeFileSync(join(b.project, 'notes.txt'), 'x');
	const { status, stdout, stderr } = b.create('bold-oak-a3f2');
	assert.equal(status, 0, stderr);
	const path = join(b.project, '.claude', 'worktrees', 'bold-oak-a3f2');
	assert.equal(stdout, `${path}\n`);
	assert.equal(stderr, '');
	for (const repo of [catHotel, dev]) {
		const worktree = join(path, repo === dev ? 'dev' : 'cat-hotel');
		assert.equal(b.git(worktree, 'rev-parse', 'HEAD'), b.git(repo, 'rev-parse', 'HEAD'));
		assert.equal(b.git(worktree, 'symbolic-ref', '--short', 'HEAD'), 'worktree-bold-oak-a3f2');
		assert.match(b.worktrees(repo), new RegExp(`worktree ${worktree}\\n[^]*?\\nlocked`));
		assert.equal(b.git(repo, 'config', 'branch.worktree-bold-oak-a3f2.catatiBase'), b.git(repo, 'rev-parse', 'HEAD'));
	}
	assert.equal(existsSync(join(path, 'dev', 'wip.txt')), true);
	assert.equal(existsSync(join(path, 'notes.txt')), false);
});

test('repo mode makes <toplevel>/.claude/worktrees/<name> on worktree-<name> and keeps it out of git status', (t) => {
	const b = box(t);
	const repo = b.repo('repo');
	mkdirSync(join(repo, 'sub'));
	const { status, stdout, stderr } = b.create('quiet-elm', join(repo, 'sub'));
	assert.equal(status, 0, stderr);
	const path = join(repo, '.claude', 'worktrees', 'quiet-elm');
	assert.equal(stdout, `${path}\n`);
	assert.equal(b.git(path, 'symbolic-ref', '--short', 'HEAD'), 'worktree-quiet-elm');
	assert.equal(b.git(repo, 'status', '--porcelain', '--untracked-files=all'), '');
	assert.equal(readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8').match(/\/\.claude\/worktrees\//g).length, 1);
	assert.equal(b.create('second', repo).status, 0);
	assert.equal(readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8').match(/\/\.claude\/worktrees\//g).length, 1);
});

test('a bad name exits 1 and creates nothing', (t) => {
	const b = box(t);
	const repo = b.repo('repo');
	for (const name of ['../escape', '.hidden', 'a/b', '', 'with space', undefined]) {
		const { status, stdout } = b.create(name);
		assert.equal(status, 1, String(name));
		assert.equal(stdout, '');
	}
	assert.equal(existsSync(join(b.project, '.claude')), false);
	assert.equal(b.branches(repo), '');
});

test('a folder with no repo exits 1', (t) => {
	const b = box(t);
	const { status, stderr } = b.create('lone');
	assert.equal(status, 1);
	assert.match(stderr, /no git repo/);
});

test('a failure in the second repo rolls back the first', (t) => {
	const b = box(t);
	const first = b.repo('a-first');
	const second = b.repo('b-second');
	b.git(second, 'branch', 'worktree-clash');
	const { status, stdout, stderr } = b.create('clash');
	assert.equal(status, 1);
	assert.equal(stdout, '');
	assert.match(stderr, /b-second|worktree-clash/);
	assert.equal(b.branches(first), '');
	assert.doesNotMatch(b.worktrees(first), /clash/);
	assert.equal(b.gitStatus(first, 'config', '--get', 'branch.worktree-clash.catatiBase').status, 1);
	assert.equal(existsSync(join(b.project, '.claude', 'worktrees', 'clash')), false);
});

test('parallel creates and removes against the same repos all succeed', async (t) => {
	const b = box(t);
	const repos = ['a', 'b', 'c'].map((name) => b.repo(name));
	const names = Array.from({ length: 8 }, (_, index) => `par-${index}`);
	const results = await Promise.all(names.map((name) => b.hookAsync('WorktreeCreate', { cwd: b.project, name })));
	for (const result of results) assert.equal(result.status, 0, result.stderr);
	for (const repo of repos) assert.deepEqual(b.branches(repo).split('\n').sort(), names.map((name) => `worktree-${name}`).sort());
	const removed = await Promise.all(results.map((result) => b.hookAsync('WorktreeRemove', { cwd: b.project, worktree_path: result.stdout.trim() })));
	for (const result of removed) assert.equal(result.status, 0, result.stderr);
	for (const repo of repos) assert.equal(b.branches(repo), '');
});

test('remove of a clean, commit-free worktree deletes it and its branch', (t) => {
	const b = box(t);
	const repos = [b.repo('one'), b.repo('two')];
	const path = b.create('tidy').stdout.trim();
	const { status, stderr } = b.remove(path);
	assert.equal(status, 0, stderr);
	assert.equal(existsSync(path), false);
	for (const repo of repos) {
		assert.equal(b.branches(repo), '');
		assert.doesNotMatch(b.worktrees(repo), /tidy/);
		assert.equal(b.gitStatus(repo, 'config', '--get', 'branch.worktree-tidy.catatiBase').status, 1);
	}
});

test('remove keeps a branch with commits and keeps a dirty worktree locked, and exits 1 while anything stays on disk', (t) => {
	const b = box(t);
	const committed = b.repo('committed');
	const dirty = b.repo('dirty');
	const path = b.create('busy').stdout.trim();
	writeFileSync(join(path, 'committed', 'work.txt'), 'done');
	b.git(join(path, 'committed'), 'add', '.');
	b.git(join(path, 'committed'), 'commit', '-q', '-m', 'work');
	writeFileSync(join(path, 'dirty', 'draft.txt'), 'wip');
	const { status, stderr } = b.remove(path);
	assert.equal(status, 1);
	assert.match(stderr, /committed; branch worktree-busy keeps 1 commit/);
	assert.match(stderr, /dirty: kept locked, it has uncommitted changes/);
	assert.equal(existsSync(join(path, 'committed')), false);
	assert.equal(b.branches(committed), 'worktree-busy');
	assert.equal(b.gitStatus(committed, 'merge', '--ff-only', 'worktree-busy').status, 0);
	assert.equal(readFileSync(join(committed, 'work.txt'), 'utf8'), 'done');
	assert.equal(existsSync(join(path, 'dirty', 'draft.txt')), true);
	assert.match(b.worktrees(dirty), /worktree-busy\nlocked/);
});

test('remove leaves a worktree it did not make', (t) => {
	const b = box(t);
	const repo = b.repo('repo');
	const other = join(b.project, 'other');
	b.git(repo, 'worktree', 'add', '-q', '-b', 'mine', other);
	const { status, stderr } = b.remove(other);
	assert.equal(status, 1);
	assert.match(stderr, /not a catati worktree branch/);
	assert.equal(existsSync(other), true);
	assert.equal(b.git(repo, 'branch', '--list', 'mine', '--format=%(refname:short)'), 'mine');
});

test('a bare git push from a worktree branch fails', (t) => {
	const b = box(t);
	const remote = join(b.project, '..', 'remote.git');
	execFileSync('git', ['init', '-q', '--bare', remote]);
	const repo = b.repo('repo');
	b.git(repo, 'remote', 'add', 'origin', remote);
	b.git(repo, 'push', '-q', 'origin', 'main');
	const path = b.create('no-push-here').stdout.trim();
	const push = b.gitStatus(join(path, 'repo'), 'push');
	assert.notEqual(push.status, 0);
	assert.match(push.stderr, /no-push/);
	assert.equal(b.gitStatus(remote, 'rev-parse', '--verify', 'refs/heads/worktree-no-push-here').status, 128);
});

test('an unknown event or bad JSON exits 1', (t) => {
	const b = box(t);
	assert.equal(b.hook('Stop', {}).status, 1);
	const result = spawnSync(process.execPath, [script], { cwd: b.project, encoding: 'utf8', input: 'not json' });
	assert.equal(result.status, 1);
});

test('the remove command cleans up the worktrees it is given, as the root runs it after a subagent ends', (t) => {
	const b = box(t);
	const repo = b.repo('repo');
	const first = b.create('first').stdout.trim();
	const second = b.create('second').stdout.trim();
	const result = spawnSync(process.execPath, [script, 'remove', first, second], { cwd: b.project, encoding: 'utf8' });
	assert.equal(result.status, 0, result.stderr);
	assert.equal(existsSync(first) || existsSync(second), false);
	assert.equal(b.branches(repo), '');
});
