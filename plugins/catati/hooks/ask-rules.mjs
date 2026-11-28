import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { isAssignment, isReserved, simpleCommands } from './shell.mjs';

// Only the calls that are dangerous to run unasked: a prod deploy, a secret or variable write, a
// repo edit or delete, a write to main's ref, an IAM change and an edit of the local or home settings.
export const sharedAskRules = [
	'Bash(make deploy-prod*)',
	'Bash(make *ENV=prod*)',
	'Bash(gh secret set*)',
	'Bash(gh secret delete*)',
	'Bash(gh variable set*)',
	'Bash(gh variable delete*)',
	'Bash(gh repo delete*)',
	'Bash(gh repo edit*)',
	'Bash(gh api *git/refs/heads/main*)',
	'Bash(gcloud * add-iam-policy-binding*)',
	'Bash(gcloud * remove-iam-policy-binding*)',
	'Edit(/.claude/settings.local.json)',
	'Edit(~/.claude/settings.json)',
];

// Rules that match only a gh api call that writes, so a read of the main ref asks nothing.
const WRITES_ONLY = new Set(['Bash(gh api *git/refs/heads/main*)']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const BODY_FLAGS = /^(?:-[fF]|--field|--raw-field|--input)(?:=|$)|^-[fF]./;

const globRegex = (pattern) => new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 's');

// Whether gh api with these words sends a write: a method other than GET, else a field or --input.
function apiWrites(words) {
	let method;
	let body = false;
	for (let index = 0; index < words.length; index++) {
		const word = words[index];
		let value;
		if (word.text === '-X' || word.text === '--method') value = words[++index];
		else if (/^(?:-X|--method=)./.test(word.text)) value = { text: word.text.replace(/^-X|^--method=/, ''), dynamic: word.dynamic };
		else if (BODY_FLAGS.test(word.text)) body = true;
		if (value) method = value.dynamic ? '' : value.text.toUpperCase();
	}
	return method === undefined ? body : method !== 'GET';
}

function commandWords(command) {
	return simpleCommands(command).map((words) => {
		const start = words.findIndex((word) => !isAssignment(word) && !isReserved(word));
		return words.slice(start < 0 ? words.length : start);
	});
}

function editMatches(pattern, path, home) {
	if (pattern.startsWith('~/')) return path === join(home, pattern.slice(2));
	return path.endsWith(pattern);
}

// The first shared ask rule the tool call matches, or undefined. It throws when the call cannot be read.
export function matchingAskRule({ tool_name, tool_input, cwd }, home = homedir()) {
	if (tool_name === 'Bash') {
		const commands = commandWords(String(tool_input?.command ?? ''));
		return sharedAskRules.find((rule) => {
			const [, tool, pattern] = rule.match(/^(\w+)\((.*)\)$/);
			if (tool !== 'Bash') return false;
			return commands.some((words) => globRegex(pattern).test(words.map((word) => word.text).join(' ')) && (!WRITES_ONLY.has(rule) || apiWrites(words)));
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
