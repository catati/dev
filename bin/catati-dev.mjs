#!/usr/bin/env node
const commands = {
	check: async () => (await import('../lib/check.mjs')).check,
	'check-merge': async () => (await import('../lib/check-merge.mjs')).checkMerge,
	'check-pr': async () => (await import('../lib/check-pr.mjs')).checkPr,
	'check-verified': async () => (await import('../lib/check-verified.mjs')).checkVerified,
	'session-start': async () => (await import('../lib/session-start.mjs')).sessionStart,
	setup: async () => (await import('../lib/setup.mjs')).setup,
};

const name = process.argv[2];
if (!Object.hasOwn(commands, name)) {
	console.error(`usage: catati-dev <${Object.keys(commands).join('|')}>`);
	process.exit(2);
}
const command = await commands[name]();
process.exitCode = command(process.cwd(), process.argv.slice(3));
