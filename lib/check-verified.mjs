import { readFileSync } from 'node:fs';

const trusted = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const fullSha = /^[0-9a-f]{40}$/;
const usage = 'usage: catati-dev check-verified [--head <full head SHA>] [<comments JSON file>]';

export function verdict(headSha, comments) {
	const line = `Verified at ${headSha}`;
	const named = comments.filter(({ body }) => body.split('\n')[0].replace(/\r$/, '') === line);
	const verifier = named.find(({ author_association }) => trusted.has(author_association));
	if (verifier) return { verified: true, line: `verified: "${line}" is from ${verifier.author_association}` };
	if (named.length > 0) {
		const associations = [...new Set(named.map(({ author_association }) => author_association))].join(', ');
		return { verified: false, line: `not verified: the "${line}" comment is from ${associations}, not OWNER, MEMBER or COLLABORATOR` };
	}
	return { verified: false, line: `not verified: no comment's first line reads "${line}"` };
}

function parseArgs(args, env) {
	let head = env.HEAD_SHA;
	let file;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--head' && i + 1 < args.length) head = args[++i];
		else if (args[i].startsWith('-') && args[i] !== '-') throw new Error(`unknown option ${args[i]}; ${usage}`);
		else if (file === undefined) file = args[i];
		else throw new Error(`takes one comments file, not ${args[i]}; ${usage}`);
	}
	if (head === undefined) throw new Error(`needs the head SHA in --head or HEAD_SHA; ${usage}`);
	if (!fullSha.test(head)) throw new Error(`head SHA "${head}" is not a full 40-character lowercase SHA`);
	return { head, file: file === undefined || file === '-' ? 0 : file };
}

function parseComments(text) {
	let comments;
	try {
		comments = JSON.parse(text);
	} catch {
		throw new Error('comments are not valid JSON');
	}
	const valid = Array.isArray(comments) && comments.every((c) => typeof c?.body === 'string' && typeof c?.author_association === 'string');
	if (!valid) throw new Error('comments JSON must be an array of objects with a string body and author_association');
	return comments;
}

export function checkVerified(cwd, args = []) {
	let head;
	let comments;
	try {
		const parsed = parseArgs(args, process.env);
		head = parsed.head;
		comments = parseComments(readFileSync(parsed.file, 'utf8'));
	} catch (error) {
		console.error(`catati-dev: check-verified ${error.message}`);
		return 2;
	}
	const result = verdict(head, comments);
	const prefix = !result.verified && process.env.GITHUB_ACTIONS === 'true' ? '::error::' : '';
	console.log(`${prefix}${result.line}`);
	return result.verified ? 0 : 1;
}
