import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sessionRepos } from './session-start.mjs';

export const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LOCK_ERROR = /\.lock'?: File exists|Unable to create '[^']*\.lock'|could not lock config file/;
const LOCK_TRIES = 4;
const REPO_LOCK_WAIT_MS = 30_000;
const REPO_LOCK_STALE_MS = 15_000;

const branchOf = (name) => `worktree-${name}`;

function pause(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function git(args, cwd) {
	for (let attempt = 1; ; attempt++) {
		const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
		if (result.status === 0) return result.stdout.trimEnd();
		const message = (result.stderr || result.error?.message || `exit ${result.status}`).trim();
		if (attempt < LOCK_TRIES && LOCK_ERROR.test(message)) {
			pause(100 * attempt);
			continue;
		}
		throw new Error(`git ${args.join(' ')}: ${message}`);
	}
}

function tryGit(args, cwd) {
	try {
		return git(args, cwd);
	} catch {
		return null;
	}
}

function commonDir(cwd) {
	return git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd);
}

function withRepoLock(repo, work) {
	const lock = join(commonDir(repo), 'catati-worktree.lock');
	const started = Date.now();
	for (;;) {
		try {
			mkdirSync(lock);
			break;
		} catch (error) {
			if (error.code !== 'EEXIST') throw error;
			let seen;
			try {
				seen = statSync(lock);
			} catch {
				continue;
			}
			if (Date.now() - seen.mtimeMs > REPO_LOCK_STALE_MS) {
				const stale = `${lock}.stale-${process.pid}-${Date.now()}`;
				try {
					if (statSync(lock).ino === seen.ino) renameSync(lock, stale);
				} catch {}
				rmSync(stale, { recursive: true, force: true });
				continue;
			}
			if (Date.now() - started > REPO_LOCK_WAIT_MS) throw new Error(`timed out waiting for ${lock}`);
			pause(25 + Math.floor(Math.random() * 50));
		}
	}
	try {
		return work();
	} finally {
		rmSync(lock, { recursive: true, force: true });
	}
}

function isLinkedWorktree(dir) {
	try {
		return statSync(join(dir, '.git')).isFile();
	} catch {
		return false;
	}
}

function excludeWorktrees(root) {
	if (tryGit(['check-ignore', '-q', '.claude/worktrees/x'], root) !== null) return;
	const info = join(commonDir(root), 'info');
	mkdirSync(info, { recursive: true });
	const exclude = join(info, 'exclude');
	const current = existsSync(exclude) ? readFileSync(exclude, 'utf8') : '';
	appendFileSync(exclude, `${current === '' || current.endsWith('\n') ? '' : '\n'}/.claude/worktrees/\n`);
}

function addWorktree(repo, path, name) {
	return withRepoLock(repo, () => addWorktreeLocked(repo, path, name));
}

function addWorktreeLocked(repo, path, name) {
	const branch = branchOf(name);
	const base = git(['rev-parse', '--verify', 'HEAD^{commit}'], repo);
	if (tryGit(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], repo) !== null) throw new Error(`${repo}: branch ${branch} already exists`);
	const made = { repo, path, branch };
	try {
		git(['worktree', 'add', '--quiet', '--lock', '-b', branch, path, base], repo);
	} catch (error) {
		dropWorktree(made);
		tryGit(['worktree', 'prune'], repo);
		throw error;
	}
	try {
		git(['config', `branch.${branch}.catatiBase`, base], repo);
		git(['config', `branch.${branch}.pushRemote`, 'no-push'], repo);
	} catch (error) {
		dropWorktree(made);
		throw error;
	}
	return made;
}

function dropWorktree({ repo, path, branch }) {
	tryGit(['worktree', 'unlock', path], repo);
	tryGit(['worktree', 'remove', path], repo);
	tryGit(['branch', '-D', branch], repo);
}

function dropWorktreeLocked(made) {
	withRepoLock(made.repo, () => dropWorktree(made));
}

export function createWorktree({ cwd, name }) {
	if (typeof name !== 'string' || !NAME.test(name)) throw new Error(`worktree name ${JSON.stringify(name)} must match ${NAME}`);
	const toplevel = tryGit(['rev-parse', '--show-toplevel'], cwd);
	if (toplevel !== null) {
		const path = join(toplevel, '.claude', 'worktrees', name);
		if (existsSync(path)) throw new Error(`${path} already exists`);
		excludeWorktrees(toplevel);
		addWorktree(toplevel, path, name);
		return realpathSync(path);
	}
	const repos = sessionRepos(cwd);
	if (repos.length === 0) throw new Error(`${cwd} is no git repo and holds none`);
	const parent = join(cwd, '.claude', 'worktrees', name);
	if (existsSync(parent)) throw new Error(`${parent} already exists`);
	mkdirSync(parent, { recursive: true });
	const made = [];
	try {
		for (const repo of repos) made.push(addWorktree(repo, join(parent, relative(cwd, repo)), name));
	} catch (error) {
		for (const worktree of made.reverse()) dropWorktreeLocked(worktree);
		tryRmdir(parent);
		throw error;
	}
	return realpathSync(parent);
}

function tryRmdir(dir) {
	try {
		rmdirSync(dir);
	} catch {}
}

function removeOne(path) {
	const repo = commonDir(path);
	const branch = tryGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], path);
	const base = branch && tryGit(['config', '--get', `branch.${branch}.catatiBase`], path);
	if (!base) return `${path}: kept, not a catati worktree branch`;
	return withRepoLock(repo, () => {
		if (git(['status', '--porcelain', '--untracked-files=all'], path) !== '') return `${path}: kept locked, it has uncommitted changes`;
		tryGit(['worktree', 'unlock', path], repo);
		git(['worktree', 'remove', path], repo);
		const tip = git(['rev-parse', '--verify', `refs/heads/${branch}`], repo);
		const ahead = Number(git(['rev-list', '--count', `${base}..${tip}`], repo));
		if (ahead === 0) {
			git(['update-ref', '-d', `refs/heads/${branch}`, tip], repo);
			tryGit(['config', '--remove-section', `branch.${branch}`], repo);
			return null;
		}
		console.error(`catati: removed ${path}; branch ${branch} keeps ${ahead} commit(s) for the root to merge`);
		return null;
	});
}

function isWorktreeRoot(path) {
	return basename(dirname(path)) === 'worktrees' && NAME.test(basename(path));
}

export function removeWorktree({ worktree_path: path }) {
	if (typeof path !== 'string' || !existsSync(path)) return [];
	if (!isWorktreeRoot(path)) return [`${path}: kept, not a .../worktrees/<name> folder`];
	const linked = isLinkedWorktree(path);
	const targets = linked
		? [path]
		: readdirSync(path)
				.map((entry) => join(path, entry))
				.filter(isLinkedWorktree)
				.sort();
	const kept = [];
	for (const target of targets) {
		try {
			const reason = removeOne(target);
			if (reason) kept.push(reason);
		} catch (error) {
			kept.push(`${target}: kept, ${error.message}`);
		}
	}
	if (!linked) tryRmdir(path);
	if (kept.length === 0 && existsSync(path)) kept.push(`${path}: kept, it still holds ${readdirSync(path).join(', ')}`);
	return kept;
}

function report(kept) {
	for (const reason of kept) console.error(`catati: ${reason}`);
	if (kept.length > 0) process.exit(1);
}

function run() {
	const [command, ...paths] = process.argv.slice(2);
	if (command === 'remove') {
		report(paths.flatMap((path) => removeWorktree({ worktree_path: resolve(path) })));
		return;
	}
	let input;
	try {
		input = JSON.parse(readFileSync(0, 'utf8'));
	} catch {
		console.error('catati: worktree hook input is not JSON');
		process.exit(1);
	}
	try {
		if (input.hook_event_name === 'WorktreeCreate') {
			console.log(createWorktree({ cwd: input.cwd ?? process.cwd(), name: input.name }));
			return;
		}
		if (input.hook_event_name === 'WorktreeRemove') {
			report(removeWorktree(input));
			return;
		}
		console.error(`catati: worktree hook got event ${input.hook_event_name}`);
		process.exit(1);
	} catch (error) {
		console.error(`catati: ${error.message}`);
		process.exit(1);
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) run();
