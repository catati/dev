import { execFileSync } from 'node:child_process';

export class RepoError extends Error {}

export function git(args, cwd, failure) {
	try {
		return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
	} catch (error) {
		throw new RepoError(error.code === 'ENOENT' ? 'git is not installed' : failure);
	}
}

export function repoRoot(cwd) {
	return git(['rev-parse', '--show-toplevel'], cwd, 'not inside a git repository').trimEnd();
}
