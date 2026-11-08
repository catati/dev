#!/usr/bin/env node
import { check } from '../lib/check.mjs';

const commands = { check };

const command = commands[process.argv[2]];
if (!command) {
	console.error(`usage: catati-dev <${Object.keys(commands).join('|')}>`);
	process.exit(2);
}
process.exitCode = command(process.cwd());
