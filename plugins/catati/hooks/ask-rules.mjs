import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { isAssignment, isReserved, simpleCommands } from './shell.mjs';

export const sharedAskRules = [
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
];

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

const globRegex = (pattern) => new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 's');

function commandLines(command) {
	return simpleCommands(command).map((words) => {
		const start = words.findIndex((word) => !isAssignment(word) && !isReserved(word));
		return words
			.slice(start < 0 ? words.length : start)
			.map((word) => word.text)
			.join(' ');
	});
}

function editMatches(pattern, path, home) {
	if (pattern.startsWith('~/')) return path === join(home, pattern.slice(2));
	return path.endsWith(pattern);
}

// The first shared ask rule the tool call matches, or undefined. It throws when the call cannot be read.
export function matchingAskRule({ tool_name, tool_input, cwd }, home = homedir()) {
	if (tool_name === 'Bash') {
		const lines = commandLines(String(tool_input?.command ?? ''));
		return sharedAskRules.find((rule) => {
			const [, tool, pattern] = rule.match(/^(\w+)\((.*)\)$/);
			return tool === 'Bash' && lines.some((line) => globRegex(pattern).test(line));
		});
	}
	if (!EDIT_TOOLS.has(tool_name)) return undefined;
	const file = tool_input?.file_path ?? tool_input?.notebook_path;
	if (typeof file !== 'string') return undefined;
	const path = resolve(cwd ?? process.cwd(), file.replace(/^~(?=\/)/, home));
	return sharedAskRules.find((rule) => {
		const [, tool, pattern] = rule.match(/^(\w+)\((.*)\)$/);
		return tool === 'Edit' && editMatches(pattern, path, home);
	});
}
