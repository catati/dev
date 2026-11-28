import { readFileSync } from 'node:fs';
import { matchingAskRule } from './ask-rules.mjs';
import { isMainModule } from './main-module.mjs';
import { ghRead, mergeDecision } from './merge-guard.mjs';

const decision = (permissionDecision, permissionDecisionReason) => ({
	hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason },
});

const unreadable = (error) => decision('ask', `catati guard could not read this tool call (${error.message}), so it asks.`);

// The PreToolUse decision for one hook input text, or undefined to let normal permissions apply.
export function guard(text, read = ghRead) {
	let input;
	try {
		input = JSON.parse(text);
		if (typeof input !== 'object' || input === null) throw new Error('it is not a JSON object');
	} catch (error) {
		return unreadable(error);
	}
	const merge = mergeDecision(input, read);
	if (merge) return decision(merge.decision, merge.reason);
	let rule;
	try {
		rule = matchingAskRule(input);
	} catch (error) {
		return unreadable(error);
	}
	if (rule) return decision('ask', `catati guard: this call matches the shared ask rule ${rule}.`);
	return undefined;
}

if (isMainModule(import.meta.url)) {
	let text = '';
	try {
		text = readFileSync(0, 'utf8');
	} catch {}
	const answer = guard(text);
	if (answer) process.stdout.write(`${JSON.stringify(answer)}\n`);
}
