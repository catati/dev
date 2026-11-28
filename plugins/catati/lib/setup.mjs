import { chmodSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { sharedAskRules } from '../hooks/ask-rules.mjs';
import { managedFiles, printFindings, repoFindings } from './check.mjs';
import { RepoError, repoRoot } from './repo.mjs';

export const retiredFiles = ['.github/pull_request_template.md'];
// Ask rules repos carried before the guard hook cut its list down to the dangerous calls, and the
// merge asks the merge guard replaces. Setup drops them from a repo's settings with the shared ones.
export const retiredAskRules = [
	'Bash(gh workflow run*)',
	'Bash(gh api *dispatches*)',
	'Bash(gh api *git/refs*)',
	'Bash(gh api *-X*contents/*)',
	'Bash(gh api *contents/*-X*)',
	'Bash(gh api *--method*contents/*)',
	'Bash(gh api *contents/*--method*)',
	'Bash(gh api *-f*contents/*)',
	'Bash(gh api *contents/*-f*)',
	'Bash(gh api *-F*contents/*)',
	'Bash(gh api *contents/*-F*)',
	'Bash(gh api *--input*contents/*)',
	'Bash(gh api *contents/*--input*)',
	'Bash(gh secret*)',
	'Bash(gh variable*)',
	'Bash(gh repo edit*)',
	'Bash(gh repo delete*)',
	'Bash(gh api *createCommitOnBranch*)',
	'Bash(gh api *createRef*)',
	'Bash(gh api *updateRef*)',
	'Bash(git -c *)',
	'Bash(make deploy-prod*)',
	'Bash(make *ENV=prod*)',
	'Bash(gcloud *iam *)',
	'Bash(gcloud * add-iam-policy-binding*)',
	'Bash(gcloud * remove-iam-policy-binding*)',
	'Edit(/.claude/settings.json)',
	'Edit(/.claude/settings.local.json)',
	'Edit(~/.claude/settings.json)',
	'Bash(gh pr merge:*)',
	'mcp__github__merge_pull_request',
];
const strippedAskRules = new Set([...retiredAskRules, ...sharedAskRules]);
const SETTINGS = '.claude/settings.json';
const MERGE_AUDIT_HOOK = /merge-audit\.mjs["']?\s+--hook\b/;

function fsCall(path, action) {
	try {
		return action();
	} catch (error) {
		throw new RepoError(`cannot write ${path}: ${error.code ?? error.message}`);
	}
}

function symlinkedParent(root, path) {
	let at = root;
	for (const part of path.split('/').slice(0, -1)) {
		at = join(at, part);
		let stat;
		try {
			stat = lstatSync(at);
		} catch (error) {
			if (error.code === 'ENOENT') return undefined;
			throw new RepoError(`cannot read ${path}: ${error.code ?? error.message}`);
		}
		if (!stat.isSymbolicLink()) continue;
		let real;
		try {
			real = realpathSync(at);
		} catch {
			return 'resolves outside the repo';
		}
		const realRoot = realpathSync(root);
		const inside = real === realRoot || real.startsWith(realRoot + sep);
		return inside ? 'has a parent directory that is a symlink; left as is' : 'resolves outside the repo';
	}
	return undefined;
}

function plan(root, entry) {
	const full = join(root, entry.path);
	const parentSkip = symlinkedParent(root, entry.path);
	if (parentSkip) return { entry, skip: parentSkip };
	let stat;
	try {
		stat = lstatSync(full);
	} catch (error) {
		if (error.code !== 'ENOENT') throw new RepoError(`cannot read ${entry.path}: ${error.code ?? error.message}`);
	}
	if (stat && !stat.isFile()) return { entry, skip: 'is not a regular file; left as is' };
	let current;
	try {
		current = stat && readFileSync(full);
	} catch (error) {
		throw new RepoError(`cannot read ${entry.path}: ${error.code ?? error.message}`);
	}
	const bytes = readFileSync(new URL(`../templates/${entry.source}`, import.meta.url));
	if (!stat) return { entry, action: 'created', bytes };
	const fileMode = stat.mode & 0o7777;
	const mode = entry.executable ? fileMode | 0o111 : fileMode;
	const action = bytes.equals(current) && mode === fileMode ? 'unchanged' : 'updated';
	return { entry, action, bytes, mode };
}

function planRemoval(root, path) {
	const parentSkip = symlinkedParent(root, path);
	if (parentSkip) return { path, skip: parentSkip };
	let stat;
	try {
		stat = lstatSync(join(root, path));
	} catch (error) {
		if (error.code === 'ENOENT') return undefined;
		throw new RepoError(`cannot read ${path}: ${error.code ?? error.message}`);
	}
	if (!stat.isFile()) return { path, skip: 'is not a regular file; left as is' };
	return { path };
}

function apply(root, { entry, action, bytes, mode }) {
	const full = join(root, entry.path);
	const staged = `${full}.catati.tmp`;
	fsCall(entry.path, () => rmSync(staged, { force: true }));
	if (action === 'unchanged') return;
	fsCall(entry.path, () => {
		mkdirSync(dirname(full), { recursive: true });
		try {
			writeFileSync(staged, bytes, { mode: entry.executable ? 0o777 : 0o666 });
			if (mode !== undefined) chmodSync(staged, mode);
			renameSync(staged, full);
		} finally {
			rmSync(staged, { force: true });
		}
	});
}

function dropEmpty(parent, key) {
	const value = parent[key];
	if ((Array.isArray(value) && value.length === 0) || (value && typeof value === 'object' && Object.keys(value).length === 0)) delete parent[key];
}

function stripAskRules(settings) {
	const ask = settings.permissions?.ask;
	if (!Array.isArray(ask)) return [];
	const removed = ask.filter((entry) => strippedAskRules.has(entry));
	if (removed.length === 0) return [];
	settings.permissions.ask = ask.filter((entry) => !strippedAskRules.has(entry));
	dropEmpty(settings.permissions, 'ask');
	dropEmpty(settings, 'permissions');
	return removed.map((entry) => `ask rule ${entry}`);
}

function stripMergeAuditHook(settings) {
	const groups = settings.hooks?.PreToolUse;
	if (!Array.isArray(groups)) return [];
	const removed = [];
	for (const group of groups) {
		if (!Array.isArray(group?.hooks)) continue;
		const kept = group.hooks.filter((hook) => !MERGE_AUDIT_HOOK.test(hook?.command ?? ''));
		for (let count = group.hooks.length - kept.length; count > 0; count--) removed.push('hook merge-audit.mjs --hook');
		group.hooks = kept;
	}
	if (removed.length === 0) return [];
	settings.hooks.PreToolUse = groups.filter((group) => !Array.isArray(group?.hooks) || group.hooks.length > 0);
	dropEmpty(settings.hooks, 'PreToolUse');
	dropEmpty(settings, 'hooks');
	return removed;
}

// The shared ask rules and the merge-audit hook now come from the plugin, so setup drops repo copies,
// and the retired ask rules with them.
function planSettings(root) {
	const parentSkip = symlinkedParent(root, SETTINGS);
	if (parentSkip) return { skip: parentSkip };
	let text;
	try {
		if (!lstatSync(join(root, SETTINGS)).isFile()) return { skip: 'is not a regular file; left as is' };
		text = readFileSync(join(root, SETTINGS), 'utf8');
	} catch (error) {
		if (error.code === 'ENOENT') return { removed: [] };
		throw new RepoError(`cannot read ${SETTINGS}: ${error.code ?? error.message}`);
	}
	let settings;
	try {
		settings = JSON.parse(text);
	} catch (error) {
		return { skip: error.message };
	}
	if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return { skip: 'is not a JSON object' };
	const removed = [...stripAskRules(settings), ...stripMergeAuditHook(settings)];
	return { removed, bytes: `${JSON.stringify(settings, null, 2)}\n` };
}

function writeSettings(root, bytes) {
	const full = join(root, SETTINGS);
	const staged = `${full}.catati.tmp`;
	fsCall(SETTINGS, () => {
		try {
			writeFileSync(staged, bytes, { mode: lstatSync(full).mode & 0o7777 });
			renameSync(staged, full);
		} finally {
			rmSync(staged, { force: true });
		}
	});
}

export function setup(cwd, args = []) {
	const unknown = args.find((arg) => arg !== '--dry-run');
	if (unknown !== undefined) {
		console.error(`catati: setup takes only --dry-run, not ${unknown}`);
		return 2;
	}
	const dryRun = args.includes('--dry-run');
	try {
		const root = repoRoot(cwd);
		const plans = managedFiles.map((entry) => plan(root, entry));
		for (const planned of plans) {
			if (planned.skip) {
				console.log(`skipped ${planned.entry.path}: ${planned.skip}`);
				continue;
			}
			if (!dryRun) apply(root, planned);
			console.log(`${planned.action} ${planned.entry.path}`);
		}
		const removals = retiredFiles.map((path) => planRemoval(root, path)).filter(Boolean);
		for (const removal of removals) {
			if (removal.skip) {
				console.log(`skipped ${removal.path}: ${removal.skip}`);
				continue;
			}
			if (!dryRun) fsCall(removal.path, () => rmSync(join(root, removal.path)));
			console.log(`removed ${removal.path}`);
		}
		const settings = planSettings(root);
		if (settings.skip) console.log(`skipped ${SETTINGS}: ${settings.skip}`);
		for (const line of settings.removed ?? []) console.log(`removed ${SETTINGS} ${line}`);
		if (settings.removed?.length) {
			if (!dryRun) writeSettings(root, settings.bytes);
			console.log(`updated ${SETTINGS}`);
		}
		printFindings(repoFindings(root, new Map(plans.filter((p) => p.bytes).map((p) => [p.entry.path, p.bytes]))));
		const skipped = [...plans, ...removals, settings].filter((p) => p.skip).length;
		if (skipped > 0) console.error(`catati: setup skipped ${skipped} file(s); the standard is not fully applied`);
	} catch (error) {
		if (!(error instanceof RepoError)) throw error;
		console.error(`catati: ${error.message}`);
		return 2;
	}
	return 0;
}
