import { execFileSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const modelRule = new URL('../rules/pstack-models.md', import.meta.url);

function git(args, cwd) {
	return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trimEnd();
}

function isDirectory(path) {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

export function setHooksPath(root) {
	if (!isDirectory(join(root, '.githooks'))) return [];
	let current;
	try {
		current = git(['config', '--default', '', '--get', 'core.hooksPath'], root);
		if (current === '.githooks') return [];
		if (current !== '') return [`hooks-path: core.hooksPath is ${current}, not .githooks; left as is`];
		git(['config', 'core.hooksPath', '.githooks'], root);
	} catch {
		throw new Error('git config core.hooksPath failed');
	}
	return [];
}

export function installModelRule(home) {
	const dest = join(home, '.claude', 'rules', 'pstack-models.md');
	if (existsSync(dest)) return [];
	mkdirSync(dirname(dest), { recursive: true });
	const staged = `${dest}.${process.pid}.tmp`;
	writeFileSync(staged, readFileSync(modelRule));
	try {
		linkSync(staged, dest);
	} catch (error) {
		if (error.code !== 'EEXIST') throw error;
	} finally {
		rmSync(staged, { force: true });
	}
	return [];
}

export function sessionRepos(base) {
	try {
		return [git(['rev-parse', '--show-toplevel'], base)];
	} catch {
		let names;
		try {
			names = readdirSync(base);
		} catch {
			return [];
		}
		return names
			.map((name) => join(base, name))
			.filter((dir) => existsSync(join(dir, '.git')))
			.sort();
	}
}

export function pluginSessionStart({ base, home }) {
	const problems = [];
	const step = (id, run) => {
		try {
			problems.push(...run());
		} catch (error) {
			problems.push(`${id}: ${error.message}`);
		}
	};
	for (const root of sessionRepos(base)) step('hooks-path', () => setHooksPath(root).map((problem) => `${root}: ${problem}`));
	step('model-rule', () => installModelRule(home));
	return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const base = process.env.CLAUDE_PROJECT_DIR || process.cwd();
	for (const problem of pluginSessionStart({ base, home: homedir() })) console.log(`catati: ${problem}`);
}
