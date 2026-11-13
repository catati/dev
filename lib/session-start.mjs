import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { installModelRule, setHooksPath } from '../plugins/catati/hooks/session-start.mjs';
import { RepoError, repoRoot } from './repo.mjs';

const nodeFloor = [24, 15];

const toolTimeoutSeconds = 3;

export const steps = [
	{ id: 'hooks-path', run: ({ root }) => setHooksPath(root) },
	{ id: 'model-rule', run: ({ home }) => installModelRule(home) },
	{
		id: 'node',
		run: ({ root }) => {
			const { output, problem } = run('node', ['-p', 'process.versions.node'], root);
			if (problem) return [problem];
			const [major, minor] = output.split('.').map(Number);
			const [floorMajor, floorMinor] = nodeFloor;
			if (major > floorMajor || (major === floorMajor && minor >= floorMinor)) return [];
			return [`node ${output} is older than ${nodeFloor.join('.')}`];
		},
	},
	{
		id: 'pnpm',
		run: ({ root }) => {
			const wanted = pnpmVersion(root);
			if (!wanted) return [];
			const { output, problem } = run('corepack', ['pnpm', '--version'], root);
			if (problem) return [`${problem}, so pnpm ${wanted} from packageManager is not available`];
			if (output !== wanted) return [`corepack runs pnpm ${output}, but packageManager asks for ${wanted}`];
			return [];
		},
	},
];

function pnpmVersion(root) {
	let manifest;
	try {
		manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	} catch (error) {
		if (error.code === 'ENOENT') return undefined;
		throw new Error(`cannot read package.json: ${error.code ?? error.message}`);
	}
	return manifest.packageManager?.match(/^pnpm@([^+]+)/)?.[1];
}

function run(command, args, cwd) {
	const env = { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' };
	const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: toolTimeoutSeconds * 1000 });
	if (result.error?.code === 'ENOENT') return { problem: `${command} is not on PATH` };
	if (result.error?.code === 'ETIMEDOUT') return { problem: `${command} ${args.join(' ')} timed out after ${toolTimeoutSeconds} s` };
	if (result.error || result.status !== 0) return { problem: `${command} ${args.join(' ')} failed` };
	return { output: result.stdout.trim() };
}

export function sessionStart(cwd) {
	let root;
	try {
		root = repoRoot(cwd);
	} catch (error) {
		if (!(error instanceof RepoError)) throw error;
		console.error(`catati: ${error.message}`);
		return 2;
	}
	const context = { root, home: homedir() };
	for (const { id, run } of steps) {
		let problems;
		try {
			problems = run(context);
		} catch (error) {
			problems = [`${id}: ${error.message}`];
		}
		for (const problem of problems) console.log(`catati: ${problem}`);
	}
	return 0;
}
