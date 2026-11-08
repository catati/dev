#!/usr/bin/env node
const commands = {
	check: async () => (await import('../lib/check.mjs')).check,
	'check-merge': async () => (await import('../lib/check-merge.mjs')).checkMerge,
	'check-pr': async () => (await import('../lib/check-pr.mjs')).checkPr,
	'session-start': async () => (await import('../lib/session-start.mjs')).sessionStart,
	setup: async () => (await import('../lib/setup.mjs')).setup,
};

const load = commands[process.argv[2]];
if (!load) {
	console.error(`usage: catati-dev <${Object.keys(commands).join('|')}>`);
	process.exit(2);
}
const command = await load();
process.exitCode = command(process.cwd(), process.argv.slice(3));
