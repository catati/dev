#!/usr/bin/env node
import { check } from '../lib/check.mjs';
import { sessionStart } from '../lib/session-start.mjs';
import { setup } from '../lib/setup.mjs';

const commands = { check, 'session-start': sessionStart, setup };

const command = commands[process.argv[2]];
if (!command) {
	console.error(`usage: catati-dev <${Object.keys(commands).join('|')}>`);
	process.exit(2);
}
process.exitCode = command(process.cwd(), process.argv.slice(3));
